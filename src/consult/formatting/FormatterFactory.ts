import { IOutputFormatter, OutputFormat, ConsultationResult } from '../../types/consult';
import { MarkdownFormatter } from './MarkdownFormatter';
import { JsonLdFormatter } from './JsonLdFormatter';

/**
 * Factory for creating output formatters based on specified format.
 */
export class FormatterFactory {
  /**
   * Get the appropriate formatter for the specified format
   */
  public static getFormatter(format: OutputFormat): IOutputFormatter {
    switch (format) {
      case OutputFormat.JSON:
        return new JsonLdFormatter();
      case OutputFormat.Markdown:
      default:
        return new MarkdownFormatter();
    }
  }

  /**
   * Format a result using the specified format.
   * Handles the 'Both' format explicitly.
   */
  public static format(result: ConsultationResult, format: OutputFormat = OutputFormat.Markdown): string {
    if (format === OutputFormat.Both) {
      const markdown = new MarkdownFormatter().format(result);
      const json = new JsonLdFormatter().format(result);
      return `${markdown}\n\n---\n\n${json}`;
    }

    return this.getFormatter(format).format(result);
  }
}
