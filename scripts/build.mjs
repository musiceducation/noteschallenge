#!/usr/bin/env node
/**
 * Static site — no bundling. Validates assets so CI / pre-deploy can run `npm run build`.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("build:", msg);
  process.exit(1);
}

function checkJs(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) fail(`missing ${file}`);
  const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    fail(`syntax: ${file}`);
  }
  console.log("ok", file);
}

function checkJson(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) fail(`missing ${file}`);
  try {
    JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    fail(`invalid JSON ${file}: ${e.message}`);
  }
  console.log("ok", file);
}

console.log("build: validate (root =", root + ")");

for (const f of [
  "script.js",
  "practice-customize.js",
  "www/practice-customize.js",
  "bootstrap-instruments.js",
  "chord-keyboard.js",
  "instrument-category.js",
  "www/instrument-category.js",
  "chinese-instrument-challenge.js",
  "www/chinese-instrument-challenge.js",
  "note-name-teach.js",
  "www/note-name-teach.js",
  "abrsm-curriculum.js",
  "www/abrsm-curriculum.js",
  "abrsm-note-grade.js",
  "www/abrsm-note-grade.js",
  "abrsm-rhythm-terms.js",
  "www/abrsm-rhythm-terms.js",
  "composition-studio.js",
  "www/composition-studio.js"
]) checkJs(f);
for (const f of ["data/instrument-bank.json", "data/instrument-structure.json"]) checkJson(f);

for (const f of ["index.html", "style.css"]) {
  if (!fs.existsSync(path.join(root, f))) fail(`missing ${f}`);
  console.log("ok", f);
}

const rhythmPage = fs.readFileSync(path.join(root, "rhythm/index.html"), "utf8");
if (rhythmPage.includes("/noteschallenge")) fail("rhythm/index.html still points at /noteschallenge");
if (!rhythmPage.includes("/rhythm/_next/static/chunks/2etrih5d8jkz5.css?v=2")) {
  fail("rhythm stylesheet is not cache-busted at /rhythm/");
}
console.log("ok", "rhythm/index.html");

console.log("build: done");
