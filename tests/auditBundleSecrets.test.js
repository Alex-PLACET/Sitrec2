const {
    collectConfigLiteralCandidates,
} = require("../scripts/auditBundleSecrets");

describe("collectConfigLiteralCandidates", () => {
    test("returns config literals without exposing placeholders", () => {
        const findings = collectConfigLiteralCandidates();

        expect(Array.isArray(findings)).toBe(true);
        for (const finding of findings) {
            expect(finding.value.includes("${")).toBe(false);
        }
    });
});
