module.exports = {
  ci: {
    collect: {
      staticDistDir: undefined,
      url: ['http://localhost:3000/', 'http://localhost:3000/products/wireless-earbuds', 'http://localhost:3000/search?q=earbuds'],
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      numberOfRuns: 2,
    },
    assert: {
      assertions: {
        // Thresholds deliberately below the checklist's ">95" aspiration —
        // this is a scaffold running against placeholder images and no CDN;
        // ratchet these up as real performance work happens, rather than
        // set an unreachable bar that just gets ignored.
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'temporary-public-storage', // swap for a persistent LHCI server once one exists, to track trends over time rather than just pass/fail per PR
    },
  },
};
