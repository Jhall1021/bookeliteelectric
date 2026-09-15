/** Actual QuestionStep browser regression; no database, camera or mocked price.
 * Tests the shared manual controls and server route resolver. This is a module
 * browser test, not a claim of full storefront checkout coverage.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { attachSurfaceRouteModule, SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { attachFinishedWallModule, FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { routingTreeFixture } from "./_routingTreeFixture";
import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";

async function main() {
  const surface = routingTreeFixture(), finished = routingTreeFixture();
  await attachSurfaceRouteModule(surface.db, "fixture", "OUTLET", 1);
  await attachFinishedWallModule(finished.db, "fixture", "OUTLET", 1);
  const questions = [...surface.questions, ...finished.questions];
  const bundle = await build({ write: false, bundle: true, platform: "browser", jsx: "automatic",
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import QuestionStep from './components/guided-flow/QuestionStep';
      const questions = ${JSON.stringify(questions)};
      const root = createRoot(document.getElementById('root'));
      window.showQuestion = (key) => { window.answer = null; root.render(
        <QuestionStep key={key} question={questions.find(q=>q.key===key)} answers={{}}
          accessBySlot={{}} onAnswer={o=>{window.answer=o;}}/>); };
    ` } });
  const server = createServer((req,res) => {
    if (req.url === "/app.js") {res.setHeader("Content-Type","application/javascript"); res.end(bundle.outputFiles[0].contents);}
    else res.end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  let checks=0;
  const check=(c:unknown,label:string)=>{assert.ok(c,label);checks++;};
  try {
    browser = await chromium.launch({headless:true,
      executablePath:process.env.ROUTING_BROWSER_EXECUTABLE || undefined,
      args:process.env.ROUTING_BROWSER_ARGS ? JSON.parse(process.env.ROUTING_BROWSER_ARGS) : undefined});
    const page=await browser.newPage();
    const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
    const address=server.address() as {port:number};
    await page.goto(`http://127.0.0.1:${address.port}`);
    const show=async(key:string)=>{
      await page.evaluate(k=>(window as any).showQuestion(k),key);
      await page.getByRole("heading",{name:questions.find(q=>q.key===key).prompt,exact:true}).waitFor();
    };
    const answer=()=>page.evaluate(()=>(window as any).answer);
    await show(SURFACE_KEYS.feet);
    check(await page.getByRole("textbox").getAttribute("inputmode")==="decimal","footage offers decimal input");
    for(const text of ["14.625","20.5","200"]) {
      await page.getByRole("textbox").fill(text);await page.getByRole("button",{name:"Continue",exact:true}).click();
      check((await answer()).value===text,"actual control preserves raw decimal answer");
    }
    for(const text of ["0","201","14-16","1e2","20.000000000000000001"]) {
      await page.getByRole("textbox").fill(text);
      check(await page.getByRole("button",{name:"Continue",exact:true}).isDisabled(),`${text}: invalid exact quantity cannot advance`);
      check(await page.getByRole("alert").isVisible(),"validation explains refusal");
    }
    await page.getByRole("button",{name:"I'm not sure",exact:true}).click();
    check((await answer()).value===NUMERIC_UNKNOWN,"unknown remains an explicit canonical answer");
    check(surface.resolve({[SURFACE_KEYS.feet]:(await answer()).value}).status==="REVIEW","server agrees unknown is review");
    for(const key of [SURFACE_KEYS.flat,SURFACE_KEYS.inside,SURFACE_KEYS.outside]) {
      await show(key);check(await page.getByRole("textbox").getAttribute("inputmode")==="numeric","fitting input is a count");
      await page.getByRole("textbox").fill("1.5");check(await page.getByRole("button",{name:"Continue",exact:true}).isDisabled(),"fractional physical fitting refused");
      await page.getByRole("textbox").fill("0");await page.getByRole("button",{name:"Continue",exact:true}).click();
      check((await answer()).value==="0","explicit zero retained");
    }
    await show(FINISHED_KEYS.feet);
    for(const [text,action] of [["19.625","CONTINUE"],["20","CONTINUE"],["20.5","PHOTO_REVIEW"]]) {
      await page.getByRole("textbox").fill(text);await page.getByRole("button",{name:"Continue",exact:true}).click();
      check((await answer()).routeAction===action,`${text}: browser follows correct threshold`);
      if(action==="PHOTO_REVIEW")check(finished.resolve({[FINISHED_KEYS.backToBack]:"no",[FINISHED_KEYS.feet]:text}).status==="REVIEW","server matches browser review");
    }
    check(errors.length===0,`no browser errors: ${errors.join()}`);
    console.log(`${checks} manual numeric browser assertions passed`);
  } finally {await browser?.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
