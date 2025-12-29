import { ConsultationResult, IOutputFormatter } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';

/**
 * Formats consultation results as JSON-LD for machine consumption.
 * Uses snake_case for all fields.
 */
export class JsonLdFormatter implements IOutputFormatter {
  /**
   * Format the consultation result as JSON string
   */
  public format(result: ConsultationResult): string {
    const jsonResult = ArtifactTransformer.consultationResultToJSON(result);
    return JSON.stringify(jsonResult, null, 2);
  }
}
