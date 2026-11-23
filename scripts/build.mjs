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
  "bootstrap-instruments.js",
  "chord-keyboard.js",
  "profile-store.js",
  "www/profile-store.js",
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
  "www/composition-studio.js",
  "web-google-auth.js",
  "www/web-google-auth.js",
  "class-share.js",
  "www/class-share.js",
  "ability-radar.js",
  "www/ability-radar.js",
  "baa-music-map.js",
  "www/baa-music-map.js",
  "appreciate-listen.js",
  "www/appreciate-listen.js",
  "composer-game.js",
  "www/composer-game.js",
  "exercise-customizer.js",
  "www/exercise-customizer.js",
  "teacher-suite.js",
  "www/teacher-suite.js",
  "theory-drill.js",
  "www/theory-drill.js",
  "classroom.js",
  "www/classroom.js",
  "aural-score.js",
  "www/aural-score.js",
  "aural-audio.js",
  "www/aural-audio.js",
  "aural-interval.js",
  "www/aural-interval.js",
  "aural-rhythm.js",
  "www/aural-rhythm.js",
  "aural-quality.js",
  "www/aural-quality.js",
  "live-quiz.js",
  "www/live-quiz.js",
  "cloudflare/noteschallenge-auth/worker.js"
]) checkJs(f);
for (const f of ["data/instrument-bank.json", "data/instrument-structure.json"]) checkJson(f);

for (const f of ["index.html", "style.css", "landing.html", "www/landing.html", "terms.html", "www/terms.html", "privacy.html", "www/privacy.html", "PRIVACY.md"]) {
  if (!fs.existsSync(path.join(root, f))) fail(`missing ${f}`);
  console.log("ok", f);
}

const rhythmPage = fs.readFileSync(path.join(root, "rhythm/index.html"), "utf8");
if (rhythmPage.includes("/noteschallenge")) fail("rhythm/index.html still points at /noteschallenge");
if (!rhythmPage.includes("/rhythm/_next/static/chunks/2etrih5d8jkz5.css?v=2")) {
  fail("rhythm stylesheet is not cache-busted at /rhythm/");
}
console.log("ok", "rhythm/index.html");

for (const f of [
  "index.html",
  "style.css",
  "script.js",
  "bootstrap-instruments.js",
  "chord-keyboard.js",
  "aural-score.js",
  "aural-audio.js",
  "aural-interval.js",
  "aural-rhythm.js",
  "aural-quality.js",
  "composer-game.js",
  "exercise-customizer.js",
  "teacher-suite.js",
  "landing.html",
  "terms.html",
  "theory-drill.js",
  "rhythm-levels.js",
  "live-quiz.js",
  "live-quiz.css"
]) {
  const rootPath = path.join(root, f);
  const wwwPath = path.join(root, "www", f);
  if (fs.existsSync(wwwPath) && !fs.readFileSync(rootPath).equals(fs.readFileSync(wwwPath))) {
    fail(`out of sync: ${f} !== www/${f}`);
  }
}
console.log("ok", "root <-> www parity");

console.log("build: done");
