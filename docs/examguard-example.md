# ExamGuard Example Integration

Below is a minimal, drop-in example of wiring **ExamGuard** on any writing test page. Adjust selectors, IDs, and callbacks to fit your page.

```html
<!-- HTML structure (example) -->
<section id="writing-prompt">
  <h2>Writing Task</h2>
  <p>Write at least 200 words about the topic...</p>
</section>

<textarea id="writing-editor" placeholder="Start writing..."></textarea>

<button id="start-test">Start</button>
<button id="submit-test">Submit</button>

<script type="module">
  import { ExamGuard } from './src/utils/examGuard.ts';

  const promptContainer = document.getElementById('writing-prompt');
  const editor = document.getElementById('writing-editor');
  const startButton = document.getElementById('start-test');
  const submitButton = document.getElementById('submit-test');

  const onSubmit = () => {
    // Submit the test (e.g. call your API or form submit)
    console.log('Submitting test...');
  };

  const onViolation = (event) => {
    // Send to your analytics dashboard or store locally
    console.log('Violation', event);
  };

  startButton?.addEventListener('click', () => {
    ExamGuard.start({
      promptContainer,
      editor,
      startButton,
      submitButton,
      onSubmit,
      onViolation,
      testId: 'writing-test-001',
      userId: 'student-123',
      maxViolations: 3,
      blurGraceMs: 300,
      suspiciousJump: {
        minDeltaChars: 80,
        maxDeltaMs: 1200,
      },
      actions: {
        warn: true,
        showBanner: true,
        disableEditor: false,
        autosubmit: true,
        blockSelectAll: true,
      },
      logEndpoint: '/api/examguard/log',
    });
  });

  submitButton?.addEventListener('click', () => {
    ExamGuard.stop();
    onSubmit();
  });
</script>
```

## What to Adjust

- **Selectors**: Map `promptContainer` and `editor` to your actual DOM elements.
- **Callbacks**: Implement `onSubmit` to send final responses, and `onViolation` to log/report violations.
- **Thresholds**: Tune `maxViolations`, `blurGraceMs`, and `suspiciousJump` for your test behavior.
- **Actions**: Enable or disable warnings, banners, editor lock, and auto-submit.
- **Logging**: Provide `logEndpoint` if you want automatic server-side logging.
