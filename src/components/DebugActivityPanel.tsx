import {
  firecrawlToolNames,
  type FirecrawlScrapeToolResult,
  type FirecrawlSearchToolResult,
} from '../lib/firecrawl';
import {
  pageContextToolNames,
  type ReadablePageContextToolResult,
  type VisiblePageContextToolResult,
} from '../lib/page-context';

type DebugActivityStatus = 'info' | 'running' | 'success' | 'error';

export type DebugToolCall = {
  name: string;
  parameters?: unknown;
  result?: unknown;
  toolCallId?: string;
  type: string;
};

export type DebugActivity = {
  createdAt: string;
  error?: string;
  id: string;
  raw?: unknown;
  source: 'agent' | 'browser' | 'firecrawl' | 'session' | 'system';
  status: DebugActivityStatus;
  summary: string;
  title: string;
  toolCall?: DebugToolCall;
};

type DebugActivityPanelProps = {
  activities: DebugActivity[];
  onClear: () => void;
};

const debugStatusLabel: Record<DebugActivityStatus, string> = {
  error: 'Error',
  info: 'Info',
  running: 'Running',
  success: 'Success',
};

const debugSourceLabel = {
  agent: 'Agent',
  browser: 'Browser',
  firecrawl: 'Firecrawl',
  session: 'Session',
  system: 'System',
} as const;

const formatDebugTimestamp = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
  });
};

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFirecrawlSearchResult = (
  value: unknown,
): value is FirecrawlSearchToolResult =>
  isRecord(value) && value.tool === firecrawlToolNames.search;

const isFirecrawlScrapeResult = (
  value: unknown,
): value is FirecrawlScrapeToolResult =>
  isRecord(value) && value.tool === firecrawlToolNames.scrape;

const isVisiblePageContextResult = (
  value: unknown,
): value is VisiblePageContextToolResult =>
  isRecord(value) && value.tool === pageContextToolNames.visible;

const isReadablePageContextResult = (
  value: unknown,
): value is ReadablePageContextToolResult =>
  isRecord(value) && value.tool === pageContextToolNames.readable;

const renderSearchResults = (result: FirecrawlSearchToolResult) => {
  if (!result.results.length) {
    return (
      <p className="debug-entry__empty">
        Firecrawl returned no links for this search.
      </p>
    );
  }

  return (
    <div className="debug-result-list">
      {result.results.map((item, index) => (
        <article
          key={`${item.url}-${String(index)}`}
          className="debug-result"
        >
          <a
            className="debug-result__link"
            href={item.url}
            rel="noreferrer"
            target="_blank"
          >
            {item.title || item.url}
          </a>
          <p className="debug-result__meta">
            {item.source}
            {item.position != null ? ` • #${String(item.position)}` : ''}
            {item.date ? ` • ${item.date}` : ''}
          </p>
          {item.snippet ? (
            <p className="debug-result__snippet">{item.snippet}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
};

const renderScrapeResult = (result: FirecrawlScrapeToolResult) => (
  <div className="debug-result">
    <a
      className="debug-result__link"
      href={result.url}
      rel="noreferrer"
      target="_blank"
    >
      {result.title?.trim() || result.url}
    </a>
    <p className="debug-result__meta">
      {result.statusCode != null
        ? `status ${String(result.statusCode)}`
        : 'status unavailable'}
      {result.fetchedAt ? ` • ${result.fetchedAt}` : ''}
      {result.truncated ? ' • truncated markdown' : ''}
    </p>
    {result.description ? (
      <p className="debug-result__snippet">{result.description}</p>
    ) : null}
    {result.markdown ? (
      <>
        <p className="debug-entry__section-title">Markdown Preview</p>
        <pre className="debug-entry__json">
          {result.markdown.slice(0, 900)}
          {result.markdown.length > 900 ? '\n…' : ''}
        </pre>
      </>
    ) : null}
  </div>
);

const renderVisiblePageContext = (result: VisiblePageContextToolResult) => (
  <div className="debug-result">
    <a
      className="debug-result__link"
      href={result.url}
      rel="noreferrer"
      target="_blank"
    >
      {result.title || result.url}
    </a>
    <p className="debug-result__meta">
      {result.pageType}
      {result.mainHeading ? ` • ${result.mainHeading}` : ''}
      {result.truncated ? ' • truncated' : ''}
    </p>
    {result.visibleTextBlocks.length ? (
      <>
        <p className="debug-entry__section-title">Visible Text</p>
        <pre className="debug-entry__json">
          {result.visibleTextBlocks.join('\n\n')}
        </pre>
      </>
    ) : null}
  </div>
);

const renderReadablePageContext = (result: ReadablePageContextToolResult) => (
  <div className="debug-result">
    <a
      className="debug-result__link"
      href={result.url}
      rel="noreferrer"
      target="_blank"
    >
      {result.title || result.url}
    </a>
    <p className="debug-result__meta">
      {result.pageType}
      {result.question ? ` • ${result.question}` : ''}
      {result.truncated ? ' • truncated' : ''}
    </p>
    {result.summary ? (
      <p className="debug-result__snippet">{result.summary}</p>
    ) : null}
    {result.matchedSections.length ? (
      <>
        <p className="debug-entry__section-title">Matched Sections</p>
        <pre className="debug-entry__json">
          {result.matchedSections
            .map(
              (section) =>
                `${section.heading} (score ${String(section.score)})\n${section.text}`,
            )
            .join('\n\n')}
        </pre>
      </>
    ) : null}
  </div>
);

export function DebugActivityPanel({
  activities,
  onClear,
}: DebugActivityPanelProps) {
  const toolCallCount = activities.filter((activity) => activity.toolCall).length;
  const runningCount = activities.filter(
    (activity) => activity.status === 'running',
  ).length;

  return (
    <section className="debug-panel" aria-label="Debug activity">
      <div className="debug-panel__header">
        <div>
          <p className="eyebrow">Debug Activity</p>
          <p className="debug-panel__headline">
            {toolCallCount
              ? `${String(toolCallCount)} tool call${toolCallCount === 1 ? '' : 's'} recorded`
              : 'No tool calls yet'}
          </p>
          <p className="debug-panel__copy">
            {runningCount
              ? `${String(runningCount)} tool call${runningCount === 1 ? '' : 's'} still in flight.`
              : 'Tool and session activity stays here until you clear it.'}
          </p>
        </div>

        <button
          className="debug-panel__action"
          disabled={!activities.length}
          type="button"
          onClick={onClear}
        >
          Clear
        </button>
      </div>

      <div className="debug-panel__feed">
        {activities.length ? (
          activities.map((activity) => (
            <details
              key={activity.id}
              className={`debug-entry debug-entry--${activity.status}`}
              open={activity.status === 'running'}
            >
              <summary className="debug-entry__summary">
                <div className="debug-entry__summary-main">
                  <span
                    className={`debug-entry__badge debug-entry__badge--${activity.source}`}
                  >
                    {debugSourceLabel[activity.source]}
                  </span>
                  <span className="debug-entry__title">{activity.title}</span>
                </div>

                <div className="debug-entry__summary-meta">
                  <span
                    className={`debug-entry__state debug-entry__state--${activity.status}`}
                  >
                    {debugStatusLabel[activity.status]}
                  </span>
                  <span className="debug-entry__time">
                    {formatDebugTimestamp(activity.createdAt)}
                  </span>
                </div>
              </summary>

              <div className="debug-entry__body">
                <p className="debug-entry__copy">{activity.summary}</p>

                {isFirecrawlSearchResult(activity.toolCall?.result) ? (
                  <>
                    <p className="debug-entry__section-title">Returned Links</p>
                    {renderSearchResults(activity.toolCall.result)}
                  </>
                ) : null}

                {isFirecrawlScrapeResult(activity.toolCall?.result) ? (
                  <>
                    <p className="debug-entry__section-title">Fetched Page</p>
                    {renderScrapeResult(activity.toolCall.result)}
                  </>
                ) : null}

                {isVisiblePageContextResult(activity.toolCall?.result) ? (
                  <>
                    <p className="debug-entry__section-title">Visible Page</p>
                    {renderVisiblePageContext(activity.toolCall.result)}
                  </>
                ) : null}

                {isReadablePageContextResult(activity.toolCall?.result) ? (
                  <>
                    <p className="debug-entry__section-title">Readable Page</p>
                    {renderReadablePageContext(activity.toolCall.result)}
                  </>
                ) : null}

                {activity.error ? (
                  <>
                    <p className="debug-entry__section-title">Error</p>
                    <pre className="debug-entry__json">{activity.error}</pre>
                  </>
                ) : null}

                {activity.toolCall?.parameters ? (
                  <>
                    <p className="debug-entry__section-title">Parameters</p>
                    <pre className="debug-entry__json">
                      {formatJson(activity.toolCall.parameters)}
                    </pre>
                  </>
                ) : null}

                {activity.toolCall?.result ? (
                  <>
                    <p className="debug-entry__section-title">Raw Result</p>
                    <pre className="debug-entry__json">
                      {formatJson(activity.toolCall.result)}
                    </pre>
                  </>
                ) : null}

                {!activity.toolCall && activity.raw ? (
                  <>
                    <p className="debug-entry__section-title">Raw Event</p>
                    <pre className="debug-entry__json">
                      {formatJson(activity.raw)}
                    </pre>
                  </>
                ) : null}
              </div>
            </details>
          ))
        ) : (
          <article className="debug-panel__empty">
            <p className="debug-panel__empty-title">No tool activity recorded</p>
            <p className="debug-panel__empty-copy">
              When Rockitt uses page tools or other agent tools, they appear here.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
