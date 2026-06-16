import { IOutputFormatter, OutputFormat, ConsultationResult } from '../../types/consult';
import type { DeliberationRecordSource, OperatorInputs, BrandingInputs, ExportFormat } from '../../types/deliberationRecord';
import { MarkdownFormatter } from './MarkdownFormatter';
import { JsonLdFormatter } from './JsonLdFormatter';
import { DeliberationRecordBuilder } from './DeliberationRecordBuilder';
import { DeliberationRecordFormatter } from './DeliberationRecordFormatter';
import { DeliberationRecordPdfFormatter } from './DeliberationRecordPdfFormatter';

/**
 * Factory for creating output formatters based on specified format.
 */
export class FormatterFactory {
  /**
   * Get the appropriate formatter for the specified format.
   *
   * NOTE: OutputFormat.PDF intentionally throws here — PDF production is async
   * and returns a Buffer, which cannot be expressed as IOutputFormatter.format(): string.
   * Use FormatterFactory.renderDeliberationRecord() for PDF dispatch (D-08).
   */
  public static getFormatter(format: OutputFormat): IOutputFormatter {
    switch (format) {
      case OutputFormat.JSON:
        return new JsonLdFormatter();
      case OutputFormat.PDF:
        throw new Error(
          'PDF is async — use FormatterFactory.renderDeliberationRecord(); ' +
          'the sync getFormatter() cannot return a Buffer'
        );
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

  /**
   * Centralized async dispatch for Deliberation Record rendering (D-08).
   *
   * Callers build the source ONCE (D-05) and pass it here. Format dispatch is
   * centralized: PDF returns a Buffer; markdown returns a string. This avoids
   * jamming the async Buffer return into the sync IOutputFormatter interface.
   *
   * @param source  Normalized record source from DeliberationRecordBuilder.
   * @param operator Operator identity + mitigations.
   * @param format   'markdown' (default) | 'pdf'
   * @param branding Optional PDF branding (company name, accent color, footer).
   */
  public static async renderDeliberationRecord(
    source: DeliberationRecordSource,
    operator: OperatorInputs,
    format: ExportFormat,
    branding?: BrandingInputs
  ): Promise<string | Buffer> {
    if (format === 'pdf') {
      return new DeliberationRecordPdfFormatter().render(source, operator, branding);
    }
    // markdown (default)
    return new DeliberationRecordFormatter().render(source, operator);
  }
}
