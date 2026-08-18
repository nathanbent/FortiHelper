/** A tool that can be mounted into the FortiNate shell. */
export interface Tool {
  /** URL-hash id, e.g. "object-helper" → #/object-helper */
  id: string;
  /** Short name shown in the nav. */
  title: string;
  /** One-line description shown under the tool heading. */
  description: string;
  /**
   * Render the tool's UI into the given container. Called once per mount.
   *
   * `param` is the rest of the route after the tool id — `#/quickstart/vpn`
   * mounts the quickstart tool with `'vpn'` — so a tool can be deep-linked to
   * a specific view. Tools that do not use it can ignore it.
   */
  mount(container: HTMLElement, param?: string): void;
}

/** A non-fatal message produced while generating output (was stderr in the CLI). */
export interface Warning {
  /** 1-based input line number when applicable. */
  line?: number;
  message: string;
}
