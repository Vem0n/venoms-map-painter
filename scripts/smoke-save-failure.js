const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

/** Failed ordinary saves expose a real diagnostic file and a usable draft recovery action. */
module.exports = async function smokeSaveFailure(window, tempDir, faults) {
  const modPath = path.join(tempDir, 'draft-mod');
  const run = body => window.webContents.executeJavaScript(`(async () => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label);
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label); element.click(); };
    const waitFor = async (predicate, message) => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() >= end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); } };
    const setInput = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
    ${body}
  })()`);
  try {
    await run(`
      click('Inspect');
      await new Promise(resolve => setTimeout(resolve, 20));
      const canvas = Array.from(document.querySelectorAll('canvas')).find(visible);
      const rect = canvas.getBoundingClientRect();
      const event = { button: 0, bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      canvas.dispatchEvent(new MouseEvent('mousedown', event)); canvas.dispatchEvent(new MouseEvent('mouseup', event));
      await waitFor(() => document.querySelector('input[placeholder="e.g. french"]'), 'Save failure fixture was not selected');
      setInput(document.querySelector('input[placeholder="e.g. french"]'), 'save_failure_culture');
      await new Promise(resolve => setTimeout(resolve, 20));
    `);
    const historyBefore = await fs.readFile(path.join(modPath, 'history/provinces/original.txt'));
    faults.beforeWrite = async channel => { if (channel === 'save-mod') throw new Error('Injected ordinary mod save failure'); };
    const logPath = await run(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true }));
      await waitFor(() => button('Write to Mod'), 'Mod-save confirmation missing');
      click('Write to Mod');
      await waitFor(() => button('Keep All & Save'), 'Orphan review missing');
      click('Keep All & Save');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Saving has failed', 'Normal save did not show the failure dialog');
      if (!button('Save Draft Instead') || !button('Back to Editing')) throw new Error('Save recovery actions missing');
      if (!document.querySelector('[role="alert"]').textContent.includes('Injected ordinary mod save failure')) throw new Error('Original save error is missing');
      return document.querySelector('[data-save-error-log-path]')?.value;
    `);
    assert.equal(path.dirname(logPath), path.join(tempDir, 'profile/logs'));
    assert.match(await fs.readFile(logPath, 'utf8'), /Injected ordinary mod save failure/);
    const draftsBefore = await fs.readdir(path.join(modPath, 'VMP-Drafts'));
    await run(`
      click('Save Draft Instead');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Save Draft', 'Draft recovery action did not open Save Draft');
      const dialog = document.querySelector('h2').parentElement;
      setInput(dialog.querySelector('input'), 'Failure recovery');
      await new Promise(resolve => setTimeout(resolve, 20));
      dialog.querySelectorAll('button')[1].click();
      await waitFor(() => document.body.innerText.includes('Draft saved: "Failure recovery"'), 'Recovery draft was not saved');
    `);
    const newDrafts = (await fs.readdir(path.join(modPath, 'VMP-Drafts'))).filter(name => !draftsBefore.includes(name));
    assert.equal(newDrafts.length, 1);
    const metadata = JSON.parse(await fs.readFile(path.join(modPath, 'VMP-Drafts', newDrafts[0], 'draft.json'), 'utf8'));
    assert.equal(metadata.provinces.find(p => p.id === 1).culture, 'save_failure_culture');
    assert.deepEqual(await fs.readFile(path.join(modPath, 'history/provinces/original.txt')), historyBefore);

    faults.beforeWrite = async channel => { if (channel === 'save-draft') throw new Error('Injected named draft failure'); };
    const draftLogPath = await run(`
      click('Save Draft');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Save Draft', 'Draft failure fixture dialog missing');
      const dialog = document.querySelector('h2').parentElement;
      dialog.querySelectorAll('button')[1].click();
      await waitFor(() => document.querySelector('h2')?.textContent === 'Saving has failed', 'Named draft failure did not show its diagnostic dialog');
      if (!button('Try Another Draft Save')) throw new Error('Draft retry action missing');
      const logPath = document.querySelector('[data-save-error-log-path]')?.value;
      click('Back to Editing');
      await waitFor(() => !document.querySelector('h2'), 'Could not dismiss draft failure');
      return logPath;
    `);
    assert.match(await fs.readFile(draftLogPath, 'utf8'), /Injected named draft failure/);
    console.log('Save failure recovery: persisted logs, mod-save-to-draft recovery, named draft errors and return to editing passed');
  } finally {
    faults.beforeWrite = null;
  }
};
