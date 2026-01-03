import { BrownfieldAnalysis } from './BrownfieldDetector';

export class ContextAugmenter {
  augmentPrompt(basePrompt: string, analysis: BrownfieldAnalysis): string {
    if (analysis.projectType === 'greenfield') {
      return `${basePrompt}\n\nNote: This appears to be a greenfield project. Recommendations should follow current best practices without bias toward existing patterns.`;
    }

    const contextBlock = this.buildContextBlock(analysis);
    const guidelines = this.buildBrownfieldGuidelines();

    return `${contextBlock}\n\n${basePrompt}\n\n${guidelines}`;
  }

  private buildContextBlock(analysis: BrownfieldAnalysis): string {
    const { techStack } = analysis;
    let block = 'IMPORTANT: This is a brownfield project with existing patterns.\n\n';
    block += 'Project Context:\n';

    if (techStack.framework) {
      let frameworkLine = techStack.framework;
      if (techStack.frameworkVersion) {
        frameworkLine += ` ${techStack.frameworkVersion}`;
      }
      if (techStack.architecturePattern) {
        frameworkLine += ` (${techStack.architecturePattern})`;
      }
      block += `- Framework: ${frameworkLine}\n`;
    }

    if (techStack.stateManagement) {
      block += `- State Management: ${techStack.stateManagement}\n`;
    }

    if (techStack.styling) {
      block += `- Styling: ${techStack.styling}\n`;
    }

    if (techStack.testing.length > 0) {
      block += `- Testing: ${techStack.testing.join(', ')}\n`;
    }

    if (techStack.api) {
      block += `- API Layer: ${techStack.api}\n`;
    }

    if (techStack.database || techStack.orm) {
      const databaseLine = [techStack.database, techStack.orm].filter(Boolean).join(' with ');
      block += `- Database: ${databaseLine}\n`;
    }

    return block.trim();
  }

  private buildBrownfieldGuidelines(): string {
    return [
      'When recommending solutions for this brownfield project:',
      '1. Prefer patterns already used in this codebase',
      '2. Maintain consistency with existing architecture',
      '3. Only suggest changes if they solve specific problems',
      '4. Consider migration costs and team familiarity',
      '5. Respect existing tech stack choices unless critically flawed'
    ].join('\n');
  }
}
