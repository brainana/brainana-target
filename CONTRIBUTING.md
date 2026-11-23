# Contributing during the early alpha

At this stage, feedback is as valuable as code. Tell us which tasks you tried, which features helped, what was confusing, and what you would remove or change. Use the feedback or bug-report issue forms.

For code changes, describe the problem and proposed behavior before making a large change. Preserve physical coordinates, original image data, project compatibility, and the distinction between display settings and scientific geometry. Do not substitute a visual approximation for a placement calculation without identifying it.

Use Node.js 24 LTS and `npm ci`. Run `npm run build`, the tests relevant to the change, and `npm test` before a pull request. Display and interaction changes should be checked in the packaged app. See Documentation/BUILD.md for platform packaging and test instructions.

Tests exercise software behavior, not surgical validity. Be explicit about the limits of any new geometry, hardware dimensions, or anatomical estimate and cite the underlying source.
