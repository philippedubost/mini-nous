import { buildBatchSvg, layoutOrdersOnSheet } from '../lib/server/batch.js'
import { flattenLayerToPaths, simplifyGravurePathD } from '../lib/server/batchPaths.js'
import { DOMParser } from '@xmldom/xmldom'

const eyeGroup = (cx, cy, rx, ry) =>
  `<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(90) scale(0.35 0.25) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})"><ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="none" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke"/></g>`

const denseTrace = 'M ' + Array.from({ length: 80 }, (_, i) => `${i * 2} ${Math.sin(i / 4) * 20 + 50}`).join(' L ')

const laser = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280">
  <g id="découpe">
    <path d="M 20 20 L 180 20 L 180 260 L 20 260 Z" stroke="#dc2626" fill="none" stroke-width="1"/>
  </g>
  <g id="gravure">
    <path d="${denseTrace}" stroke="#000" fill="none"/>
    ${eyeGroup(100, 120, 12, 8)}
    ${eyeGroup(140, 118, 11, 7)}
  </g>
</svg>`

// Ellipses préservées (cubiques + skipSimplify)
const doc = new DOMParser().parseFromString(laser, 'image/svg+xml')
const gravure = doc.getElementById('gravure')
const flat = flattenLayerToPaths(gravure, { placementMatrix: 'translate(0,0)', layerId: 'gravure', orderId: 't', simplifyGravure: true })
const eyePaths = flat.filter(p => p.skipSimplify)
if (eyePaths.length !== 2) throw new Error(`expected 2 eye paths, got ${eyePaths.length}`)
for (const p of eyePaths) {
  if ((p.d.match(/\bC\b/g) || []).length < 4) throw new Error('eye path missing cubic beziers')
}

// Trace dense → moitié des points
const simplified = simplifyGravurePathD(denseTrace)
const simpCount = (simplified.match(/\bL\b/g) || []).length + 1
if (simpCount !== 40) throw new Error(`expected 40 points, got ${simpCount}`)

const orders = [0, 1].map(i => ({ id: `o${i}`, generation_id: `g${i}`, laserSvg: laser }))
const { sheetWidthMm, sheetHeightMm, placements } = layoutOrdersOnSheet(orders, {})
const svg = buildBatchSvg({ sheetWidthMm, sheetHeightMm, placements, weekKey: 'test', kerfMm: -0.1 })

if (placements.length !== 2) throw new Error('expected 2 placements')
if (placements[0].y !== placements[1].y) throw new Error('expected same row')
if (Math.abs(placements[0].height - 180) > 0.1) throw new Error(`expected 180mm height, got ${placements[0].height}`)
if (placements[1].x + placements[1].width > 1000) throw new Error('row should fit within 100cm')

const gravureLayer = svg.match(/<g id="gravure"[^>]*>([\s\S]*?)<\/g>\s*<\/svg>/)?.[1] ?? ''
const cInBatch = (gravureLayer.match(/\bC\b/g) || []).length
if (cInBatch < 8) throw new Error(`batch gravure should keep eye cubics, C count=${cInBatch}`)

console.log('OK', { eyePaths: eyePaths.length, cInBatch, sheetWidthMm, sheetHeightMm })
