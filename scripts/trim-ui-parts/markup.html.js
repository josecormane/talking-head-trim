// trim-ui-parts/markup.html.js
// Returns the <body> markup for Talking Head Trim UI
export function htmlMarkup() {
  return `
  <header>
    <div class="header-left">
      <h1>Trim UI</h1>
      <span id="summary">Loading...</span>
    </div>
    <div class="header-center">
      <div id="operationStatus" class="activity-status" role="status" aria-live="polite">Ready</div>
    </div>
    <div class="header-right">
      <div class="header-group history-actions" aria-label="History">
        <button id="undoButton" class="icon-btn" data-icon="undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled></button>
        <button id="redoButton" class="icon-btn" data-icon="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled></button>
        <button id="resetButton" class="icon-btn danger" data-icon="reset" title="Reset to primary cut" aria-label="Reset" disabled></button>
      </div>
      <div class="header-group project-actions" aria-label="Project">
        <button id="projectInfoButton" class="icon-btn" data-icon="info" title="Project info" aria-label="Project info"></button>
        <button id="rendersButton" class="library-button" data-icon="film" title="Open render library" aria-label="Open render library">
          <span>Renders</span>
          <span id="renderCountBadge" class="render-count">0</span>
        </button>
      </div>
      <div class="header-group export-actions" aria-label="Save and export">
        <button id="saveButton" class="secondary-action">Save changes</button>
        <button id="previewButton" class="secondary-action">Render preview</button>
        <button id="finalButton" class="primary export-primary">Render final</button>
      </div>
    </div>
  </header>

  <main class="editor-shell">
    <section class="viewer-panel">
      <div class="video-stage">
        <video id="sourceVideo" preload="metadata" playsinline></video>
      </div>
        <div class="transport">
          <div class="transport-left">
            <div class="segmented mode-switch" aria-label="Playback mode">
              <button id="modeEditButton" class="mode-opt active">Cut</button>
              <button id="modeSourceButton" class="mode-opt">Source</button>
            </div>
            <div class="transport-controls" aria-label="Playback controls">
              <button id="goPrev" class="icon-btn transport-step" data-icon="skip-left" title="Previous cut" aria-label="Previous cut"></button>
              <button id="playPauseButton" class="transport-play success" data-icon="play" title="Play" aria-label="Play"></button>
              <button id="goNext" class="icon-btn transport-step" data-icon="skip-right" title="Next cut" aria-label="Next cut"></button>
            </div>
            <span id="playModeLabel" class="timecode">00:00.00 / 00:00.00</span>
          </div>
          <div class="transport-right editor-toggles">
            <label class="tool-toggle" data-icon="eye" title="Play kept segments only">
              <input id="greenOnlyToggle" type="checkbox" checked />
              <span>Cut only</span>
            </label>
            <label class="tool-toggle" data-icon="magnet" title="Snap playhead to cut edges">
              <input id="playheadSnapToggle" type="checkbox" checked />
              <span>Snap</span>
            </label>
          </div>
        </div>
      </section>

      <section class="timeline-panel">
        <div class="timeline-bar">
          <div class="timeline-bar-left">
            <span class="field-label">Timeline</span>
          </div>
          <div class="timeline-bar-right zoom-control" aria-label="Timeline zoom">
            <button id="zoomOutButton" class="icon-btn zoom-button" data-icon="zoom-out" title="Zoom out" aria-label="Zoom out"></button>
            <input id="zoomSlider" type="range" min="2" max="96" step="1" value="6" aria-label="Timeline zoom" />
            <button id="zoomInButton" class="icon-btn zoom-button" data-icon="zoom-in" title="Zoom in" aria-label="Zoom in"></button>
            <span id="zoomValue" class="zoom-value">6 px/s</span>
          </div>
        </div>
      <div id="timelineViewport">
        <div id="timelineTrack">
          <canvas id="waveformCanvas"></canvas>
          <div class="ruler" id="ruler"></div>
          <div id="silenceLayer"></div>
          <div id="edgeLayer"></div>
          <div id="segmentLayer"></div>
          <div id="playhead"><div id="playheadLabel">00:00.00</div></div>
        </div>
      </div>
    </section>

    <aside class="sidebar">
      <div class="edit-panel">
        <section id="panelSegment" class="segment-compact" aria-label="Selected cut">
          <div class="segment-head">
            <div class="segment-title-block">
              <span class="section-title">Selected cut</span>
              <strong id="selectedTitle">Segment</strong>
            </div>
            <div class="segment-head-actions">
              <span id="selectedOutput" class="badge">00:00.00</span>
              <button id="deleteSegmentButton" class="icon-btn danger" data-icon="trash" title="Delete selected segment" aria-label="Delete selected segment"></button>
            </div>
          </div>

          <div class="inspector-grid compact-grid">
            <label><span class="field-label">Start</span>
            <input id="startInput" type="text" />
          </label>
          <label><span class="field-label">End</span>
            <input id="endInput" type="text" />
          </label>
        </div>

          <div class="nudge-bar compact-nudge">
          <span class="field-label">Edges</span>
          <span class="micro-label">Start</span>
          <button class="icon-btn" data-icon="step-left" data-nudge="start:-0.05" title="Start -50ms" aria-label="Start -50ms"></button>
          <button class="icon-btn" data-icon="step-right" data-nudge="start:0.05" title="Start +50ms" aria-label="Start +50ms"></button>
          <span class="micro-label">End</span>
          <button class="icon-btn" data-icon="step-left" data-nudge="end:-0.05" title="End -50ms" aria-label="End -50ms"></button>
          <button class="icon-btn" data-icon="step-right" data-nudge="end:0.05" title="End +50ms" aria-label="End +50ms"></button>
          <select id="nudgeScope" title="Scope" aria-label="Scope">
            <option value="current" selected>This</option>
            <option value="all">All</option>
          </select>
        </div>

          <div class="inline-actions compact-actions">
          <button id="playContext" data-icon="play-circle" title="Play with context" aria-label="Play with context"><span>Context</span></button>
          <button id="playSegment" data-icon="play" title="Play selected cut" aria-label="Play selected cut"><span>Selected cut</span></button>
          <label class="checkline"><input id="snapToggle" type="checkbox" checked /> Word snap</label>
        </div>

          <div class="silence-section compact-silences">
          <div class="silence-header">
            <span class="section-title" style="margin-bottom:0;">Silences</span>
            <span id="segmentSilenceCount" class="silence-count">0</span>
          </div>
          <div id="segmentSilences" class="silence-list"></div>
        </div>
        </section>

        <section id="panelTranscript" class="transcript-panel" aria-label="Transcript">
          <div class="transcript-meta">
          <span class="section-title" style="margin-bottom:0;">Transcript</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span id="dirtyState" class="badge">no changes</span>
            <span id="transcriptDropCount" class="badge">0 removed</span>
          </div>
        </div>
        <div class="transcript-actions">
          <button id="addDeletedSelectionButton" class="success">Add selection</button>
          <button id="clearDeletedSelectionButton">Clear</button>
          <span id="deletedSelectionLabel" class="badge" style="margin-left:auto;">no selection</span>
        </div>
          <div id="transcriptScroll" class="transcript-scroll">
          <div id="transcriptFlow" class="transcript-flow"></div>
        </div>
        </section>
      </div>
    </aside>
  </main>

  <div id="projectInfoModal" class="modal-backdrop" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="projectInfoTitle">
      <div class="modal-head">
        <strong id="projectInfoTitle">Project info</strong>
        <button id="closeProjectInfoButton" class="icon-btn" data-icon="x" title="Close" aria-label="Close"></button>
      </div>
      <div id="status" class="status">Ready.</div>
    </div>
  </div>

  <div id="rendersModal" class="modal-backdrop" hidden>
    <div class="modal-card renders-modal" role="dialog" aria-modal="true" aria-labelledby="rendersTitle">
      <div class="modal-head">
        <div>
          <strong id="rendersTitle">Render library</strong>
          <p class="modal-subtitle">Select a render to preview it.</p>
        </div>
        <button id="closeRendersButton" class="icon-btn" data-icon="x" title="Close" aria-label="Close"></button>
      </div>
      <div class="renders-layout">
        <section class="render-list-pane" aria-label="Render list">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span id="rendersSummary" style="font-size:11px;color:var(--t3);">Loading...</span>
            <button id="refreshRendersButton" class="icon-btn" data-icon="refresh" title="Refresh" aria-label="Refresh"></button>
          </div>
          <div id="renderList" class="render-list"></div>
        </section>
        <section class="render-preview-pane" aria-label="Preview">
          <div id="renderEmptyPreview" class="render-empty-preview">Select a render from the list.</div>
          <video id="renderPreviewVideo" class="render-player" controlslist="nofullscreen nodownload noremoteplayback" disablepictureinpicture playsinline preload="metadata" hidden></video>
          <div id="renderPreviewToolbar" class="render-preview-toolbar" hidden>
            <button id="renderPlayButton" class="secondary-action" data-icon="play" title="Play in panel" aria-label="Play in panel"><span>Play</span></button>
            <button id="renderFullscreenButton" class="secondary-action" data-icon="maximize" title="View fullscreen" aria-label="View fullscreen">Fullscreen</button>
          </div>
          <div id="renderDetails" class="render-details">Select a render.</div>
        </section>
      </div>
    </div>
  </div>
`;
}
