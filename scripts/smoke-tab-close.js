const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function snapshot(root, includeDrafts = true) {
  const result = {};
  for (const relative of await fs.readdir(root, { recursive: true })) {
    if (!includeDrafts && relative.split(path.sep)[0] === 'VMP-Drafts') continue;
    const file = path.join(root, relative);
    const stat = await fs.stat(file, { bigint: true });
    result[relative] = stat.isDirectory() ? 'directory' : (await fs.readFile(file)).toString('hex');
  }
  return result;
}

/** Exercise tab-close choices and save failure through the actual Electron UI. */
module.exports = async function smokeTabClose(window, ipcMain, tempDir, writeCalls, faults) {
  const modPath = path.join(tempDir, 'draft-mod');
  const run = (body, arg = null) => window.webContents.executeJavaScript(`(async (arg) => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label || (label === 'Inspect' && element.textContent.trim().startsWith('Inspect')));
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label + '; visible buttons: ' + Array.from(document.querySelectorAll('button')).filter(visible).map(b => b.textContent.trim()).join(', ')); element.click(); };
    const waitFor = async (predicate, message) => {
      const end = Date.now() + 5000;
      while (!predicate()) { if (Date.now() >= end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); }
    };
    const bar = () => document.querySelector('#root').firstElementChild.firstElementChild;
    const tabs = () => Array.from(bar().children).filter(element => element.textContent.trim() !== '+');
    const closeTab = index => {
      const control = Array.from(tabs()[index].querySelectorAll('span,button')).find(element => element.textContent.trim() === '×');
      if (!control) throw new Error('Close control missing for tab ' + index);
      control.click();
    };
    const addTab = () => Array.from(bar().children).find(element => element.textContent.trim() === '+').click();
    const setInput = (input, value) => {
      if (!input) throw new Error('Input missing for ' + value);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const field = label => Array.from(document.querySelectorAll('div')).filter(visible).find(element => element.children.length === 0 && element.textContent.trim() === label)?.parentElement.querySelector('input');
    const editProvince = async culture => {
      click('Inspect');
      await new Promise(resolve => setTimeout(resolve, 20));
      const canvas = Array.from(document.querySelectorAll('canvas')).find(visible);
      const rect = canvas.getBoundingClientRect();
      const event = { button: 0, bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      canvas.dispatchEvent(new MouseEvent('mousedown', event)); canvas.dispatchEvent(new MouseEvent('mouseup', event));
      await waitFor(() => field('Culture (county-scoped)'), 'Inspector did not select a province');
      setInput(field('Culture (county-scoped)'), culture);
      await waitFor(() => tabs().some(element => element.textContent.includes('•')), 'Edited tab did not become dirty');
    };
    ${body}
  })(${JSON.stringify(arg)})`);

  // Intercept final window-close approval so the test process can inspect results.
  const closeHandlers = ipcMain.listeners('confirm-close');
  ipcMain.removeAllListeners('confirm-close');
  let closeApprovals = 0;
  ipcMain.on('confirm-close', () => { closeApprovals++; });
  try {
    await run(`
      await editProvince('close_guard_culture');
      const title = Array.from(document.querySelectorAll('[data-hierarchy-title]')).find(element => visible(element) && element.textContent === 'c_confirmed_only');
      title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      const input = Array.from(document.querySelectorAll('input')).find(element => visible(element) && element.value === 'c_confirmed_only');
      setInput(input, 'c_saved_on_close');
      await new Promise(resolve => setTimeout(resolve, 20));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor(() => document.body.innerText.includes('Title rename staged'), 'Close fixture title rename was not staged');
      addTab();
      await new Promise(resolve => setTimeout(resolve, 20));
      closeTab(2); // Close the dirty inactive tab; the empty fourth tab stays active.
      await waitFor(() => document.querySelector('h2')?.textContent === 'Close Tab', 'Closing a dirty tab skipped the unsaved-changes guard');
      if (tabs().length !== 4 || !button('Open Map')) throw new Error('Dirty inactive tab was removed or activated before a decision');
    `);
    const before = await snapshot(modPath);
    const originalMod = await snapshot(modPath, false);
    const writesBeforeCancel = writeCalls.length;
    await run(`
      click('Cancel');
      await waitFor(() => !document.querySelector('h2'), 'Tab-close cancel did not dismiss the dialog');
      if (tabs().length !== 4 || !tabs()[2].textContent.includes('•')) throw new Error('Cancel discarded the dirty tab');
      closeTab(2);
      await waitFor(() => button('Save Draft & Close'), 'Save Draft & Close choice is missing');
    `);
    assert.equal(writeCalls.length, writesBeforeCancel, 'Opening or cancelling tab-close wrote files');
    assert.deepEqual(await snapshot(modPath), before, 'Cancelling tab-close modified files or drafts');
    assert.equal(closeApprovals, 0, 'Closing a tab approved closing the window');

    // Hold the save in flight, then reject it. Repeated close requests cannot bypass it.
    let rejectSave;
    let entered = false;
    faults.beforeWrite = async (channel, args) => {
      if (channel === 'save-draft' && args[1] === modPath) {
        entered = true;
        return new Promise((_resolve, reject) => { rejectSave = reject; });
      }
    };
    await run(`click('Save Draft & Close'); await waitFor(() => button('Saving...'), 'Draft save did not enter busy state');`);
    assert.equal(entered, true, 'Tab close did not invoke the target draft save');
    await run(`
      if (!button('Cancel').disabled || !button("Don't Save").disabled) throw new Error('Close choices remained enabled while saving');
      const content = document.querySelector('#root').firstElementChild.children[1];
      if (!content.inert) throw new Error('Editor remained interactive during close confirmation');
    `);
    window.close();
    assert.equal(closeApprovals, 0, 'Window close bypassed an in-flight tab save');
    rejectSave(new Error('Injected draft save failure'));
    await run(`
      await waitFor(() => document.querySelector('[role="alert"]')?.textContent.includes('Injected draft save failure'), 'Save failure was not shown in the close dialog');
      if (tabs().length !== 4 || !tabs()[2].textContent.includes('•')) throw new Error('Failed save discarded the target tab');
      if (!button('Save Draft & Close') || button('Save Draft & Close').disabled) throw new Error('Failed save cannot be retried');
      if (!button('Back to Editing') || !button('Close Tab Without Saving')) throw new Error('Failed close traps the user');
    `);
    const tabFailureLog = await run(`return document.querySelector('[data-save-error-log-path]')?.value;`);
    assert.equal(path.dirname(tabFailureLog), path.join(tempDir, 'profile/logs'));
    assert.match(await fs.readFile(tabFailureLog, 'utf8'), /Injected draft save failure/);
    assert.deepEqual(await snapshot(modPath), before, 'Rejected draft save changed files');
    assert.equal(closeApprovals, 0, 'Failed draft save approved window close');
    faults.beforeWrite = null;
    const draftsBefore = await fs.readdir(path.join(modPath, 'VMP-Drafts'));
    await run(`
      click('Save Draft & Close');
      await waitFor(() => tabs().length === 3, 'Successful draft save did not close its target tab');
      if (!button('Open Map') || tabs()[2].textContent.includes('draft-mod')) throw new Error('Saving an inactive tab closed or switched the wrong tab');
    `);
    const newDrafts = (await fs.readdir(path.join(modPath, 'VMP-Drafts'))).filter(name => !draftsBefore.includes(name));
    assert.equal(newDrafts.length, 1, 'Retry did not create exactly one successful draft');
    const metadata = JSON.parse(await fs.readFile(path.join(modPath, 'VMP-Drafts', newDrafts[0], 'draft.json'), 'utf8'));
    assert.equal(metadata.modPath, modPath, 'Inactive tab saved to another mod');
    assert.equal(metadata.provinces.find(p => p.id === 1).culture, 'close_guard_culture');
    assert.deepEqual(metadata.titleRenames, [{ oldKey: 'c_confirmed_only', newKey: 'c_saved_on_close' }]);
    assert.deepEqual(await snapshot(modPath, false), originalMod, 'Save Draft & Close wrote mod files');
    assert.equal(closeApprovals, 0, 'Successful tab close approved window close');

    // Reopen the mod and explicitly discard a dirty active tab; no save may run.
    ipcMain.removeHandler('select-directory');
    ipcMain.handle('select-directory', () => modPath);
    await run(`
      addTab();
      await new Promise(resolve => setTimeout(resolve, 20));
      click('Open Map');
      await waitFor(() => document.body.innerText.includes('Loaded 32x32 map'), 'Discard fixture did not load');
      await editProvince('explicitly_discarded_culture');
      closeTab(3);
      await waitFor(() => button("Don't Save"), 'Discard choice is missing');
    `);
    const beforeDiscard = await snapshot(modPath);
    const writesBeforeDiscard = writeCalls.length;
    await run(`
      click("Don't Save");
      await waitFor(() => tabs().length === 3, 'Explicit discard did not close the target tab');
      if (!button('Open Map')) throw new Error('Closing active tab did not return to its neighbor');
      closeTab(1); // clean inactive tab
      await waitFor(() => tabs().length === 2, 'Clean tab did not close immediately');
      if (document.querySelector('h2')) throw new Error('Clean tab unexpectedly required a discard decision');
      closeTab(1); // clean active tab, leaving one tab
      await waitFor(() => tabs().length === 1, 'Could not return to single-tab mode');
      if (Array.from(tabs()[0].querySelectorAll('span,button')).some(element => element.textContent.trim() === '×')) throw new Error('Last tab can be closed');
      await editProvince('single_tab_guard_culture');
    `);
    assert.equal(writeCalls.length, writesBeforeDiscard, 'Discarding or closing clean tabs wrote files');
    assert.deepEqual(await snapshot(modPath), beforeDiscard, 'Explicit discard changed files or drafts');

    // There must be one window-close owner even after returning to a single tab.
    const firstMod = path.join(tempDir, 'mod');
    const beforeSingle = await snapshot(firstMod);
    window.close();
    await run(`
      await waitFor(() => button('Save 1 Draft & Close'), 'Single-tab window-close guard missing');
      if (Array.from(document.querySelectorAll('h2')).filter(visible).length !== 1) throw new Error('Competing window-close dialogs appeared');
      click('Cancel');
      await waitFor(() => !document.querySelector('h2'), 'Single-tab close could not be cancelled');
    `);
    assert.equal(closeApprovals, 0, 'Cancelling window-close approved exit');
    assert.deepEqual(await snapshot(firstMod), beforeSingle, 'Cancelling window-close wrote files');
    faults.beforeWrite = async channel => { if (channel === 'save-draft') throw new Error('Single-tab draft failure'); };
    window.close();
    await run(`
      await waitFor(() => button('Save 1 Draft & Close'), 'Single-tab retry guard missing');
      click('Save 1 Draft & Close');
      await waitFor(() => document.querySelector('[role="alert"]')?.textContent.includes('Single-tab draft failure'), 'Single-tab save error missing');
      if (tabs().length !== 1) throw new Error('Failed save removed last tab');
    `);
    assert.equal(closeApprovals, 0, 'Failed single-tab save approved window exit');
    assert.deepEqual(await snapshot(firstMod), beforeSingle);
    const windowFailureLog = await run(`return document.querySelector('[data-save-error-log-path]')?.value;`);
    assert.match(await fs.readFile(windowFailureLog, 'utf8'), /Single-tab draft failure/);
    await run(`
      if (document.querySelector('h2').textContent !== 'Saving has failed') throw new Error('Failure heading is unclear');
      click('Back to Editing');
      await waitFor(() => !document.querySelector('h2'), 'Failed window save could not return to editing');
    `);
    assert.equal(closeApprovals, 0, 'Returning to editing approved window exit');

    // Even losing the logging IPC must leave a working explicit exit choice.
    faults.beforeWrite = async channel => {
      if (channel === 'save-draft') throw new Error('Another draft failure');
      if (channel === 'report-save-failure') throw new Error('Diagnostic log service unavailable');
    };
    window.close();
    await run(`
      await waitFor(() => button('Save 1 Draft & Close'), 'Window-close guard missing after returning to editing');
      click('Save 1 Draft & Close');
      await waitFor(() => document.querySelector('[role="alert"]')?.textContent.includes('Diagnostic log service unavailable'), 'Failed logging did not show fallback error details');
      if (document.querySelector('[data-save-error-log-path]')) throw new Error('UI claims a log was saved despite failed reporting');
      click('Close Without Saving');
      await waitFor(() => !document.querySelector('h2'), 'Explicit exit after save/log failure is blocked');
    `);
    assert.equal(closeApprovals, 1, 'Explicit Close Without Saving did not approve exit');
    assert.deepEqual(await snapshot(firstMod), beforeSingle, 'Explicit exit saved or discarded files on disk');
    faults.beforeWrite = null;
    window.close();
    await run(`await waitFor(() => button('Save 1 Draft & Close'), 'Final save guard missing');`);
    faults.beforeWrite = null;
    await run(`click('Save 1 Draft & Close'); await waitFor(() => !document.querySelector('h2'), 'Window-close retry did not complete');`);
    assert.equal(closeApprovals, 2, 'Successful window-close retry did not approve exit exactly once');
    const firstDrafts = await fs.readdir(path.join(firstMod, 'VMP-Drafts'));
    const saved = JSON.parse(await fs.readFile(path.join(firstMod, 'VMP-Drafts', firstDrafts[0], 'draft.json'), 'utf8'));
    assert.ok(saved.provinces.some(p => p.culture === 'single_tab_guard_culture'));
    assert.deepEqual(await snapshot(firstMod, false), beforeSingle, 'Window-close draft save wrote game files');
    console.log('Close guards: inactive/active dirty tabs, cancel/discard, failed/busy saves, retry, clean/last tabs and single-tab window close passed');
  } finally {
    faults.beforeWrite = null;
    ipcMain.removeAllListeners('confirm-close');
    closeHandlers.forEach(handler => ipcMain.on('confirm-close', handler));
  }
};
