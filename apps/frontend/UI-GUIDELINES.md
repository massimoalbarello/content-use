# Content Use UI decisions

Use the template's Minimal Neutral theme and shared Base UI primitives. Keep media and captions
as the dominant content; chrome supports the record without competing with it.

Call a saved piece of content a **record**. Each record presents its original media, then its
captions in Markdown. Use the same identity, status, and action wording throughout the workspace.

Creation starts with an explicit action and a focused form. Editing replaces the read-only values
in place; Cancel and Save record occupy the same action area. Confirm permanent deletion with the
shared alert dialog. Loading, empty, and error states must offer a useful next step.

Keep forms labelled and preserve keyboard focus, contrast, reduced-motion behavior, and responsive
layouts. Ask for user intent; derive identifiers and download metadata in the backend.
