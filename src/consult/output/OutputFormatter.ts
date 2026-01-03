import { ConsultationResult, OutputFormat } from '../../types/consult';
import { MarkdownFormatter } from '../formatting/MarkdownFormatter';
import { JsonLdFormatter } from '../formatting/JsonLdFormatter';

export interface FormattedOutput {
  content: string;
  format: OutputFormat;
}

export class OutputFormatter {
  private markdownFormatter: MarkdownFormatter;
  private jsonFormatter: JsonLdFormatter;

  constructor() {
    this.markdownFormatter = new MarkdownFormatter();
    this.jsonFormatter = new JsonLdFormatter();
  }

  formatOutput(result: ConsultationResult, format: OutputFormat): FormattedOutput {
    switch (format) {
      case OutputFormat.Markdown:
        return { content: this.formatMarkdown(result), format };
      case OutputFormat.JSON:
        return { content: this.formatJSON(result), format };
      case OutputFormat.Both:
        return { content: this.formatBoth(result), format };
      default:
        // Default to Markdown
        return { content: this.formatMarkdown(result), format: OutputFormat.Markdown };
    }
  }

  formatMarkdown(result: ConsultationResult): string {
    return this.markdownFormatter.format(result);
  }

  formatJSON(result: ConsultationResult): string {
    return this.jsonFormatter.format(result);
  }

  formatBoth(result: ConsultationResult): string {
    const markdown = this.formatMarkdown(result);
    const json = this.formatJSON(result);
    return `${markdown}\n---\n${json}`;
  }
}
