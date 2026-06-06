import { chromium } from "playwright";
const url = process.argv[2] || "https://bombe-web.vercel.app";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(3500);
const sections = await p.locator("section").count();
console.log("sections:", sections);
for (let i = 0; i < sections; i++) {
  try {
    await p
      .locator("section")
      .nth(i)
      .screenshot({ path: `_shots/sec-${i}.png` });
    console.log("shot sec", i);
  } catch (e) {
    console.log("sec", i, "fail", String(e).slice(0, 80));
  }
}
await b.close();
