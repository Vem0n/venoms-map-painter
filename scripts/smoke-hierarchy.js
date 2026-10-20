const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

/** Verify actual GPU output, including union borders, disconnected pieces and tile seams. */
module.exports = async function smokeHierarchy(window, ipcMain, tempDir, writeCalls) {
  const modPath = path.join(tempDir, 'hierarchy-mod');
  await fs.mkdir(path.join(modPath, 'map_data'), { recursive: true });
  await fs.mkdir(path.join(modPath, 'common/landed_titles'), { recursive: true });
  const colors = [[75,75,75], [90,20,20], [20,40,140], [20,140,50], [160,160,20], [130,20,150], [180,90,20], [70,90,110]];
  const definitions = '0;0;0;0;x;x;\n' + colors.map((rgb,i) => `${i+1};${rgb.join(';')};Province ${i+1};x;`).join('\n') + '\n';
  await fs.writeFile(path.join(modPath, 'map_data/definition.csv'), definitions);
  await fs.writeFile(path.join(modPath, 'common/landed_titles/test.txt'), `
    e_one = { k_one = {
      d_one = {
        c_one = { b_one = { province = 2 } b_two = { province = 3 } }
        c_two = { b_three = { province = 4 } }
      }
      d_two = { c_three = { b_four = { province = 5 } } }
    } k_two = { d_three = { c_four = { b_five = { province = 6 } } } } }
    c_county_only = { b_county_only = { province = 8 } }
    e_two = { k_three = { d_four = { c_five = { b_six = { province = 7 } } } } }
  `);
  const image = new PNG({ width: 1026, height: 770 });
  for (let y=0;y<770;y++) for(let x=0;x<1026;x++) image.data.set([...colors[0],255], (y*1026+x)*4);
  const rectangle = (id,x0,y0,x1,y1) => { for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) image.data.set([...colors[id],255], (y*1026+x)*4); };
  rectangle(1,100,80,350,700); rectangle(2,350,80,600,700);
  rectangle(1,800,100,820,120); // Disconnected piece of the county, far from its main landmass.
  rectangle(3,650,160,740,400); rectangle(4,850,300,940,450);
  rectangle(5,20,200,80,400); rectangle(6,980,30,1026,90);
  rectangle(7,760,500,820,560); // A county with no duchy/kingdom/empire.
  // Unregistered empty pixels exercise the no-province case as well.
  for(let y=700;y<720;y++) for(let x=960;x<980;x++) image.data.set([0,0,0,255],(y*1026+x)*4);
  const originalPng = PNG.sync.write(image);
  await fs.writeFile(path.join(modPath, 'map_data/provinces.png'), originalPng);
  ipcMain.removeHandler('select-directory'); ipcMain.handle('select-directory', () => modPath);
  const run = body => window.webContents.executeJavaScript(`(async () => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label);
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label); element.click(); };
    const waitFor = async (predicate, message) => { const end = Date.now()+5000; while(!predicate()) { if(Date.now()>=end) throw new Error(message); await new Promise(resolve=>setTimeout(resolve,20)); } };
    const tick = () => new Promise(resolve=>setTimeout(resolve,30));
    const canvas = () => Array.from(document.querySelectorAll('canvas')).find(visible);
    const point = (x,y) => {
      const target=canvas(), r=target.getBoundingClientRect();
      // The engine fits integer framebuffer dimensions, not fractional CSS sizes.
      const z=Math.min(target.width/1026,target.height/770);
      return { button:0,bubbles:true,
        clientX:r.left+(target.width/2+(x-513)*z)*r.width/target.width,
        clientY:r.top+(target.height/2+(y-385)*z)*r.height/target.height };
    };
    const sample = async (x,y) => { const event=point(x,y); canvas().dispatchEvent(new MouseEvent('mousedown',event)); canvas().dispatchEvent(new MouseEvent('mouseup',event)); await tick(); };
    const title = key => Array.from(document.querySelectorAll('[data-hierarchy-title]')).filter(visible).find(element=>element.dataset.hierarchyTitle===key);
    const highlight = async key => { if(!title(key)) throw new Error('Missing title: '+key); title(key).click(); await tick(); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); };
    ${body}
  })()`);
  await run(`
    const tabBar=document.querySelector('#root').firstElementChild.firstElementChild;
    Array.from(tabBar.children).find(element=>element.textContent.trim()==='+').click(); await tick();
    click('Open Map');
    await waitFor(()=>document.body.innerText.includes('Loaded 1026x770 map') && button('Open Map') && !button('Open Map').disabled, 'Hierarchy fixture did not load');
    click('Inspect'); await tick(); await sample(150,250);
    await waitFor(()=>title('e_one'), 'Inspector hierarchy did not resolve');
  `);
  const beforeWrites = writeCalls.length;
  // Sample inside the edge band: the last map column can be subpixel at fit zoom.
  const points = await run(`return Object.fromEntries(Object.entries({
    inside:[200,250], interiorBorderLeft:[348,250], interiorBorderRight:[351,250],
    xSeamLeft:[510,250], xSeamRight:[513,250], ySeamTop:[250,510], ySeamBottom:[250,513],
    boundary:[101.5,250], island:[801.5,110], otherCounty:[680,250], otherDuchy:[880,350],
    otherKingdom:[50,250], otherEmpire:[1000,50], mapEdge:[1024.5,50]
  }).map(([key,[x,y]])=>{const p=point(x,y);return [key,{x:p.clientX,y:p.clientY}];}));`);
  // Read the actual framebuffer; desktop color profiles can alter capturePage RGBs.
  const capture = async () => run(`return new Promise(resolve => requestAnimationFrame(() => {
    const target=canvas(), gl=target.getContext('webgl2'), rect=target.getBoundingClientRect();
    const result={};
    for(const [name,p] of Object.entries(${JSON.stringify(points)})) {
      const x=Math.floor((p.x-rect.left)*target.width/rect.width);
      const y=target.height-1-Math.floor((p.y-rect.top)*target.height/rect.height);
      const data=new Uint8Array(4);
      gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);
      result[name]=Array.from(data.slice(0,3));
    }
    resolve(result);
  }));`);
  const pixel = (frame,key) => frame[key];
  const baseline = await capture();
  assert.deepEqual(pixel(baseline,'inside'), colors[1], 'Base map GPU output is wrong');
  assert.deepEqual(pixel(baseline,'island'), colors[1], 'Detached-island sample missed the province before highlighting');
  await run(`
    await highlight('c_one');
    if(title('c_one').getAttribute('aria-pressed')!=='true') throw new Error('Active county is not indicated');
    const dot=title('c_one').parentElement.querySelector('div');
    if(!dot.style.boxShadow || dot.style.boxShadow==='none' || !dot.style.outline.includes('2px')) throw new Error('Active hierarchy dot does not glow');
    if(!document.querySelector('[data-title-highlight="c_one"]')?.textContent.includes('2 provinces')) throw new Error('County member count wrong');
  `);
  const county = await capture();
  const border = [121,184,255];
  const closeColor = (actual,expected,message) => assert.ok(actual.every((value,i)=>Math.abs(value-expected[i])<=2), `${message}: ${actual} versus ${expected}`);
  closeColor(pixel(county,'boundary'), border, 'County outer border missing');
  closeColor(pixel(county,'island'), border, 'Detached county piece is not outlined');
  closeColor(pixel(county,'inside'), colors[1].map((v,i)=>v*.88+[88,166,255][i]*.12), 'County fill tint wrong');
  assert.deepEqual(pixel(county,'xSeamLeft'), pixel(county,'xSeamRight'), 'Artificial border at horizontal tile seam');
  assert.deepEqual(pixel(county,'ySeamTop'), pixel(county,'ySeamBottom'), 'Artificial border at vertical tile seam');
  assert.notDeepEqual(pixel(county,'interiorBorderLeft'), border, 'Internal province boundary was outlined');
  assert.notDeepEqual(pixel(county,'interiorBorderRight'), border, 'Internal province boundary was outlined');
  closeColor(pixel(county,'otherCounty'), colors[3].map(v=>v*.45), 'Unselected county not dimmed');
  if(process.env.VMP_HIERARCHY_SCREENSHOT) await fs.writeFile(process.env.VMP_HIERARCHY_SCREENSHOT, (await window.webContents.capturePage()).toPNG());

  for (const [key,count,included,excluded] of [
    ['d_one',3,'otherCounty','otherDuchy'], ['k_one',4,'otherDuchy','otherKingdom'], ['e_one',5,'otherKingdom','otherEmpire'],
  ]) {
    await run(`await highlight('${key}'); if(!document.querySelector('[data-title-highlight="${key}"]')?.textContent.includes('${count} provinces')) throw new Error('Wrong ${key} count'); if(title('c_one').getAttribute('aria-pressed')!=='false') throw new Error('Old tier stayed active');`);
    const frame=await capture();
    assert.notDeepEqual(pixel(frame,included), pixel(county,included), `${key} did not include its additional provinces`);
    assert.ok(pixel(frame,excluded).every((value,i)=>Math.abs(value-pixel(baseline,excluded)[i]*.45)<=2), `${key} includes an unrelated title`);
  }
  await run(`await highlight('e_one'); if(document.querySelector('[data-title-highlight]')) throw new Error('Clicking active title did not clear it');`);
  assert.deepEqual(pixel(await capture(),'inside'), pixel(baseline,'inside'), 'Clearing highlight changed map appearance');
  await run(`await highlight('c_one'); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await tick(); if(document.querySelector('[data-title-highlight]')) throw new Error('Escape failed to clear title'); await sample(1000,50); await waitFor(()=>title('e_two'),'Other empire hierarchy missing'); await highlight('e_two');`);
  closeColor(pixel(await capture(),'mapEdge'), [249,116,109], 'Map-edge border missing on a partial tile');
  await run(`document.querySelector('[aria-label="Clear hierarchy highlight"]').click(); await tick();`);

  // Choosing a tier once follows future map clicks, both within and across titles.
  for(const [source,target,tier,tint] of [
    ['c_one','c_five','c',[88,166,255]], ['d_one','d_four','d',[188,140,255]],
    ['k_one','k_three','k',[210,153,34]], ['e_one','e_two','e',[248,81,73]],
  ]) {
    await run(`
      await sample(150,250); await waitFor(()=>title('${source}'),'Source hierarchy did not load');
      await highlight('${source}');
      await sample(450,250);
      await waitFor(()=>document.querySelector('[data-title-highlight="${source}"]') && title('${source}')?.getAttribute('aria-pressed')==='true','Clicking within the same title exited its tier');
      await sample(1000,50);
      await waitFor(()=>document.querySelector('[data-title-highlight="${target}"][data-title-tier="${tier}"]') && title('${target}')?.getAttribute('aria-pressed')==='true','Map click did not follow active ${tier} tier');
      const dot=title('${target}').parentElement.querySelector('div');
      if(!dot.style.boxShadow || dot.style.boxShadow==='none') throw new Error('Following title lost active dot glow');
    `);
    const frame=await capture();
    closeColor(pixel(frame,'mapEdge'),tint.map(v=>v*.8+255*.2),'Following title did not update shader membership/tint');
    closeColor(pixel(frame,'inside'),colors[1].map(v=>v*.45),'Following title kept the previous territory highlighted');
    await run(`await highlight('${target}'); if(document.querySelector('[data-title-tier]')) throw new Error('Clicking followed title failed to exit the mode');`);
  }

  await run(`
    await sample(150,250); await waitFor(()=>title('d_one'),'Original duchy missing'); await highlight('d_one');
    await sample(770,520); await waitFor(()=>title('c_county_only'),'County-only hierarchy missing');
    const badge=document.querySelector('[data-title-tier="d"]');
    if(!badge || badge.dataset.titleHighlight || !badge.textContent.includes('no duchy assigned')) throw new Error('Missing duchy did not leave an explicit waiting mode');
    // No explicit reactivation: the next assigned province resumes the same tier.
    await sample(1000,50);
    await waitFor(()=>document.querySelector('[data-title-highlight="d_four"]'),'Duchy mode did not resume after an absent tier');
    await sample(950,600);
    if(!document.querySelector('[data-title-tier="d"]') || document.querySelector('[data-title-highlight]').dataset.titleHighlight) throw new Error('Unassigned province kept old duchy or exited mode');
    await sample(970,710);
    if(!document.querySelector('[data-title-tier="d"]') || document.querySelector('[data-title-highlight]').dataset.titleHighlight) throw new Error('Empty pixel kept old duchy or exited mode');
  `);
  assert.deepEqual(pixel(await capture(),'inside'),pixel(baseline,'inside'),'Missing hierarchy left a stale shader outline/dimming');
  await run(`
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await tick();
    if(document.querySelector('[data-title-tier]')) throw new Error('Escape failed to exit waiting tier mode');
    await sample(150,250); await waitFor(()=>title('d_one'),'Hierarchy did not recover');
    if(document.querySelector('[data-title-tier]')) throw new Error('Explicitly cleared mode resumed unexpectedly');
    await highlight('d_one'); await sample(770,520);
    document.querySelector('[aria-label="Clear hierarchy highlight"]').click(); await tick();
    if(document.querySelector('[data-title-tier]')) throw new Error('Clear button failed to exit waiting tier mode');
  `);

  assert.equal(writeCalls.length, beforeWrites, 'Hierarchy clicks invoked write-capable IPC');
  assert.deepEqual(await fs.readFile(path.join(modPath,'map_data/provinces.png')), originalPng);
  assert.equal(await fs.readFile(path.join(modPath,'map_data/definition.csv'),'utf8'), definitions);
  await run(`
    // Reloading a map starts a fresh inspection session even for the same mod path.
    await sample(150,250); await waitFor(()=>title('d_one'),'Reload source title missing'); await highlight('d_one');
    click('Open Map');
    await waitFor(()=>button('Open Map') && !button('Open Map').disabled && !document.querySelector('[data-title-tier]'),'Map reload preserved old hierarchy mode');
    await sample(150,250); await waitFor(()=>title('d_one'),'Reloaded hierarchy missing');
    if(document.querySelector('[data-title-tier]')) throw new Error('Old tier resumed on the newly loaded map');
    const tab=Array.from(document.querySelectorAll('[data-tab-id]')).find(element=>element.textContent.includes('hierarchy-mod'));
    if(tab.textContent.includes('•')) throw new Error('Read-only hierarchy view dirtied the tab');
    tab.querySelector('button').click(); await tick();
    if(button("Don't Save")) throw new Error('Read-only hierarchy viewing prompted to save');
  `);
  console.log('Hierarchy: county/duchy/kingdom/empire, active-dot glow, actual GPU union borders, disconnected pieces, both tile seams, partial map edges, following tiers across clicks, missing/empty assignments, explicit exit, map reload and zero write IPC during inspection passed');
};
