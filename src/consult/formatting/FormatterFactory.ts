import { IOutputFormatter, OutputFormat, ConsultationResult } from '../../types/consult';
import { MarkdownFormatter } from './MarkdownFormatter';
import { JsonLdFormatter } from './JsonLdFormatter';
import { DeliberationRecordBuilder } from './DeliberationRecordBuilder';
import { DeliberationRecordFormatter } from './DeliberationRecordFormatter';

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
   * For DeliberationRecord, builds from ConsultationResult with a default operator identity.
   * The real operator-input path is renderDeliberationRecordFromSession (Task 3).
   */
  public static format(result: ConsultationResult, format: OutputFormat = OutputFormat.Markdown): string {
    if (format === OutputFormat.Both) {
      const markdown = new MarkdownFormatter().format(result);
      const json = new JsonLdFormatter().format(result);
      return `${markdown}\n\n---\n\n${json}`;
    }

    if (format === OutputFormat.DeliberationRecord) {
      const operator = { operatorName: 'Operator' };
      const source = DeliberationRecordBuilder.fromConsultation(result, operator);
      return new DeliberationRecordFormatter().render(source, operator);
    }

    return this.getFormatter(format).format(result);
  }
}
