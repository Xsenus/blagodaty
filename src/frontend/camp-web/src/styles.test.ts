/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

describe('modal scroll styles', () => {
  it('keeps the registration form scrollable inside the viewport', () => {
    expect(styles).toMatch(/\.modal-shell\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);/s);
    expect(styles).toMatch(/\.modal-shell\s*{[^}]*height:\s*min\(860px,\s*calc\(100dvh - 32px\)\);/s);
    expect(styles).toMatch(/\.modal-sidebar\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(styles).toMatch(/\.modal-main\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(styles).toMatch(/@media \(max-width: 1180px\)[\s\S]*\.modal-shell\s*{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  });
});

describe('registration form layout styles', () => {
  it('stacks form groups and keeps participant checkbox compact', () => {
    expect(styles).toMatch(/\.modal-section-grid,\s*\.price-option-list\s*{[^}]*grid-template-columns:\s*1fr;/s);
    expect(styles).toMatch(/\.modal-event-summary\s*{[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.participant-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) max-content;[^}]*align-items:\s*end;/s);
    expect(styles).toMatch(/\.participant-grid \.compact-checkbox-row\s*{[^}]*justify-self:\s*end;[^}]*white-space:\s*nowrap;/s);
  });
});

describe('public place layout styles', () => {
  it('centers fact cards and provides a review grid', () => {
    expect(styles).toMatch(/\.facts-strip article\s*{[^}]*align-content:\s*center;[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.facts-strip strong\s*{[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.place-review-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s);
    expect(styles).toMatch(/\.place-review-footer\s*{[^}]*justify-content:\s*space-between;/s);
  });
});
