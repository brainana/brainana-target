import assert from 'node:assert/strict'
import fs from 'node:fs'
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const planner = JSON.parse(fs.readFileSync('apps/planner/package.json', 'utf8'))
const version = JSON.parse(fs.readFileSync('VERSION.json', 'utf8'))
assert.equal(root.name, 'brainana-target')
assert.equal(planner.version, root.version)
assert.equal(version.version, root.version)
const tag = process.env.RELEASE_TAG
if (tag?.startsWith('v')) assert.equal(tag, `v${root.version}`, 'Release tag must match the app version')
console.log(`Application version: ${root.version}`)
