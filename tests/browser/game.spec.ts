import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
const sql=(query:string)=>execFileSync('docker',['compose','-p','arcade-check','exec','-T','database','psql','-U','app','-d','app','-Atc',query],{env:{...process.env,POSTGRES_PASSWORD:'local-verification-only'},encoding:'utf8'}).trim();

test('desktop: real API, safe start, flag, keyboard, resume, modal, sound, loss',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  await page.setViewportSize({width:1440,height:1100}); await page.goto('/');
  await expect(page.locator('.loading-pixel')).toHaveCount(0);
  await expect(page.locator('.cell')).toHaveCount(81);
  await expect(page.locator('.board')).toHaveCSS('display','grid');
  await page.screenshot({path:'.verification/desktop.png',fullPage:true});
  await page.locator('#cell-40').click();
  await expect(page.locator('.board-message')).toContainText('očišćeno');
  const gameId=await page.evaluate(()=>sessionStorage.getItem('arcade-game'));
  const mines=JSON.parse(sql(`SELECT board->'mines' FROM games WHERE id='${gameId}'`));
  const target=page.locator('#cell-'+mines[0]);
  await target.click({button:'right'}); await expect(target).toHaveClass(/flagged/);
  await target.focus();await page.keyboard.press('f');await expect(target).not.toHaveClass(/flagged/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cell-'+Math.max(0,mines[0]-1))).toBeFocused();
  const count=await page.locator('.cell.open').count(); await page.reload();
  await expect(page.locator('.cell.open')).toHaveCount(count);
  await page.getByRole('button',{name:'Nova igra',exact:true}).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Nastavi partiju'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Uključi zvuk'}).click();await expect(page.getByRole('button',{name:'Isključi zvuk'})).toHaveAttribute('aria-pressed','true');
  await target.click();await expect(page.locator('.board-message')).toContainText('Jedna mina previše');
  await page.getByRole('button',{name:'Kako igrati'}).click();await expect(page.getByRole('dialog')).toContainText('Klasični poredak');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('win and arcade initials persist in the actual leaderboard',async({page})=>{
  await page.goto('/');await expect(page.locator('.loading-pixel')).toHaveCount(0);
  await page.locator('#cell-40').click();await expect(page.locator('.board-message')).toContainText('očišćeno');
  const gameId=await page.evaluate(()=>sessionStorage.getItem('arcade-game'));
  const mines=JSON.parse(sql(`SELECT board->'mines' FROM games WHERE id='${gameId}'`));
  for(let i=0;i<81;i++){
    if(mines.includes(i))continue;
    const cell=page.locator('#cell-'+i);
    if((await cell.getAttribute('class'))?.includes('open'))continue;
    const response=page.waitForResponse(r=>r.url().includes('/actions') && r.request().method()==='POST');await cell.click();await response;
    await expect(page.locator('.board')).toHaveAttribute('aria-busy','false');
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('TVOJA TRI INICIJALA').fill('UX1');
  await page.route('**/api/games/*/score',r=>r.abort());
  await page.getByRole('button',{name:'Spremi svoj rezultat'}).click();
  await expect(page.getByRole('dialog').locator('.error-message')).toBeVisible();
  await page.unroute('**/api/games/*/score');
  await page.getByRole('button',{name:'Spremi svoj rezultat'}).click();
  await expect(page.locator('.saved-message')).toContainText('Rezultat je spremljen');
  expect(sql(`SELECT initials FROM scores WHERE game_id='${gameId}'`)).toBe('UX1');
  await page.screenshot({path:'.verification/victory.png',fullPage:true});
  await page.getByRole('button',{name:'Zatvori prozor'}).click();
  await page.reload();await expect(page.locator('.board-message')).toContainText('Čista pobjeda');
  await expect(page.locator('.save-inline')).toHaveCount(0);
});

test('mobile: no document overflow, touch flag mode, difficulty, horizontal board',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();await page.goto(process.env.TEST_BASE_URL || 'http://localhost:4200');
  await expect(page.locator('.loading-pixel')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.verification/mobile.png',fullPage:true});
  await page.locator('#cell-40').tap();await expect(page.locator('.board-message')).toContainText('očišćeno');
  await page.getByRole('button',{name:'Označi',exact:true}).tap();
  const cell=page.locator('.cell:not(.open)').first();await cell.tap();await expect(cell).toHaveClass(/flagged/);
  await cell.tap();await expect(cell).not.toHaveClass(/flagged/);
  // A long touch followed by the browser's context menu and click must flag only once.
  await cell.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1});
  await expect(cell).toHaveClass(/flagged/);
  await cell.dispatchEvent('contextmenu');await cell.dispatchEvent('pointerup');await cell.dispatchEvent('click');
  await expect(page.locator('.board')).toHaveAttribute('aria-busy','false');await expect(cell).toHaveClass(/flagged/);
  await page.getByRole('button',{name:/Ekspert/}).tap();await page.getByRole('dialog').getByRole('button',{name:'Nova igra'}).tap();
  await expect(page.locator('.cell')).toHaveCount(480);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const board=page.locator('.board-scroll');expect(await board.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await context.close();
});

test('network failure is visible and scores can be retried',async({page})=>{
  await page.route('**/api/leaderboard**',r=>r.abort()); await page.goto('/');
  await expect(page.locator('.empty-scores')).toContainText('trenutačno odmara');
  await page.unroute('**/api/leaderboard**');await page.getByRole('button',{name:'Pokušaj ponovno'}).click();
  await expect(page.locator('.score-row').first()).toBeVisible();
  await page.route('**/api/games',r=>r.abort());await page.locator('#cell-40').click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.cell.open')).toHaveCount(0);
  await page.unroute('**/api/games');await page.locator('#cell-40').click();await expect(page.locator('.board-message')).toContainText('očišćeno');
});

test('WCAG automated checks on desktop, help dialog and narrow mobile',async({page})=>{
  await page.goto('/');await expect(page.locator('.loading-pixel')).toHaveCount(0);
  const scan=()=>new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button',{name:'Kako igrati'}).click();
  expect((await scan()).violations).toEqual([]);
  await page.keyboard.press('Escape');await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await scan()).violations).toEqual([]);
});
