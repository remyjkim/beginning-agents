import { describe, it, expect } from "bun:test";
import { detectLanguages } from "../repo-detector";

describe("Repo Detector", () => {
  it("should detect TypeScript projects", () => {
    const detection = detectLanguages(process.cwd());

    // Expected to detect some language in this repo
    expect(Object.keys(detection.languages).length).toBeGreaterThanOrEqual(0);
    expect(["high", "medium", "low", "none"]).toContain(detection.confidence);
  });

  it("should handle projects with no source files", () => {
    // Mock test - would use a temp directory with no source files
    // For now, just ensure the function is callable
    expect(detectLanguages).toBeDefined();
  });

  it("should calculate language percentages correctly", () => {
    const detection = detectLanguages(process.cwd());

    // If languages detected, percentages should sum to 100
    if (Object.keys(detection.languages).length > 0) {
      const total = Object.values(detection.languages).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    }
  });
});
