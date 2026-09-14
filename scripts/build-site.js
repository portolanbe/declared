#!/usr/bin/env node
// Bundles the browser-safe modules into site/index.html so the policy builder
// runs exactly the code the Action and CLI run — no second implementation.
import { readFileSync, writeFileSync } from 'node:fs';

const MODULES = ['yaml', 'policy', 'parse', 'evaluate', 'report', 'render'];
const EXPORTS = [
  'resolvePolicy', 'loadPolicy', 'PolicyError', 'PRESETS', 'LEVELS', 'LEVEL_INFO', 'evaluate',
  'renderComment', 'renderPolicyYaml', 'renderPolicyDoc', 'renderPrSection', 'renderWorkflow', 'DEFAULT_USES',
];

const source = MODULES.map((name) => {
  const code = readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import [^;]+;\n/gm, '')
    .replace(/^export (?=const |function |class |async )/gm, '');
  return `// ---- src/${name}.js ----\n${code}`;
}).join('\n');

const bundle = `window.Declared = (() => {\n'use strict';\n${source}\nreturn { ${EXPORTS.join(', ')} };\n})();`
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');

new Function(bundle); // fail the build on a syntax error rather than ship a blank page

const template = readFileSync(new URL('../site/template.html', import.meta.url), 'utf8');
if (!template.includes('/*__DECLARED_BUNDLE__*/')) throw new Error('site/template.html is missing the bundle placeholder');
writeFileSync(new URL('../site/index.html', import.meta.url), template.replace('/*__DECLARED_BUNDLE__*/', () => bundle));
console.log(`site/index.html written (${MODULES.length} modules, ${(bundle.length / 1024).toFixed(1)} KB bundle)`);
