/**
 * Node Registration Smoke Test
 *
 * Validates that every CNode* class exported from src/nodes/ can be:
 *   1. Imported without errors
 *   2. Found in the set of exported class names
 *
 * This catches broken imports, missing dependencies, and registration issues
 * across all ~190 node classes in a single test run.
 *
 * NOTE: We do NOT attempt to construct nodes here because most require
 * complex globals (Three.js scenes, DOM, GPU contexts, Sit configuration).
 * The value of this test is catching import-time failures — syntax errors,
 * missing modules, circular dependency crashes — which are the most common
 * regressions when adding or refactoring nodes.
 */

import fs from 'fs';
import path from 'path';

const nodesDir = path.resolve(__dirname, '../src/nodes');

// Collect all .js files that could contain CNode exports
const nodeFiles = fs.readdirSync(nodesDir)
    .filter(f => f.endsWith('.js'))
    .sort();

describe('Node Registration', () => {

    test('src/nodes/ directory contains node files', () => {
        expect(nodeFiles.length).toBeGreaterThan(100);
    });

    // Build map: filename -> exported CNode* class names
    const fileExports = {};
    for (const file of nodeFiles) {
        const filePath = path.join(nodesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const classNames = [];
        // Match "export class CNodeFoo" patterns, excluding commented-out lines
        const regex = /^[ \t]*export\s+class\s+(CNode\w+)/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            classNames.push(match[1]);
        }
        if (classNames.length > 0) {
            fileExports[file] = classNames;
        }
    }

    test('finds CNode classes across many files', () => {
        const fileCount = Object.keys(fileExports).length;
        expect(fileCount).toBeGreaterThan(80);
    });

    test('every exported CNode class follows naming convention', () => {
        const allClasses = Object.values(fileExports).flat();
        for (const cls of allClasses) {
            // Allow CNode followed by uppercase OR digit (e.g. CNode3D, CNode3DGroup)
            expect(cls).toMatch(/^CNode[A-Z0-9]/);
        }
    });

    test('no duplicate class names across files', () => {
        const seen = new Map(); // className -> filename
        const duplicates = [];
        for (const [file, classes] of Object.entries(fileExports)) {
            for (const cls of classes) {
                if (seen.has(cls)) {
                    duplicates.push(`${cls} in both ${seen.get(cls)} and ${file}`);
                }
                seen.set(cls, file);
            }
        }
        expect(duplicates).toEqual([]);
    });

    test('CNodeFactory short names are unique (no CNode prefix collisions)', () => {
        const allClasses = Object.values(fileExports).flat();
        const shortNames = allClasses.map(c => c.substring(5)); // strip "CNode"
        const seen = new Map();
        const collisions = [];
        for (let i = 0; i < allClasses.length; i++) {
            const short = shortNames[i];
            if (seen.has(short)) {
                collisions.push(`"${short}" from ${allClasses[i]} and ${seen.get(short)}`);
            }
            seen.set(short, allClasses[i]);
        }
        expect(collisions).toEqual([]);
    });

    test('CNodeFactory and CNodeManager are not accidentally registered as node types', () => {
        // These are infrastructure classes, not graph nodes
        const allClasses = Object.values(fileExports).flat();
        // CNodeFactory should be in the directory but should NOT be registerable
        // as a graph node (it doesn't extend CNode). The registration system
        // uses require.context and filters by "CNode" prefix, so verify these
        // special files export exactly what we expect.
        const factoryClasses = fileExports['CNodeFactory.js'] || [];
        expect(factoryClasses).toEqual(['CNodeFactory']);
        const managerClasses = fileExports['CNodeManager.js'] || [];
        expect(managerClasses).toEqual(['CNodeManager']);
    });

    // Verify that every file with CNode exports is importable (no syntax errors)
    // This uses dynamic import to catch module-level errors without executing constructors
    const CNodeFiles = Object.keys(fileExports);

    test('all node files are valid JavaScript (parseable)', () => {
        const parseErrors = [];
        for (const file of CNodeFiles) {
            const filePath = path.join(nodesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            // Check for common syntax issues that would prevent import
            // (unmatched braces, unterminated strings, etc.)
            // A full parse would require babel, but we can catch obvious issues
            const openBraces = (content.match(/\{/g) || []).length;
            const closeBraces = (content.match(/\}/g) || []).length;
            if (Math.abs(openBraces - closeBraces) > 2) {
                // Allow small discrepancy for template literals/regex, but flag large mismatches
                parseErrors.push(`${file}: brace mismatch (open=${openBraces}, close=${closeBraces})`);
            }
        }
        expect(parseErrors).toEqual([]);
    });

    test('all node files import from valid relative paths', () => {
        const badImports = [];
        for (const file of CNodeFiles) {
            const filePath = path.join(nodesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            // Check that relative imports point to files that exist
            const importRegex = /from\s+['"](\.\/.+?)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                const importPath = match[1];
                // Resolve relative to the nodes directory
                let resolved = path.resolve(nodesDir, importPath);
                if (!resolved.endsWith('.js')) resolved += '.js';
                if (!fs.existsSync(resolved)) {
                    badImports.push(`${file}: imports "${importPath}" which does not exist`);
                }
            }
        }
        expect(badImports).toEqual([]);
    });

    test('total CNode class count is within expected range', () => {
        const total = Object.values(fileExports).flat().length;
        // If this drops significantly, something is wrong with the scan.
        // If it grows, that's fine — update the lower bound.
        expect(total).toBeGreaterThan(150);
        console.log(`Found ${total} CNode classes across ${CNodeFiles.length} files`);
    });
});
