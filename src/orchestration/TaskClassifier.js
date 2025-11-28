/**
 * TaskClassifier - Determines which agent should take the lead on a task
 */

const { AGENT_ROLES } = require('./AgentRoles');

class TaskClassifier {
  /**
   * Classify a task and determine the primary agent
   * @param {string} task - The task description
   * @returns {Object} - { primaryAgent, taskType, confidence, reasoning }
   */
  static classify(task) {
    const taskLower = task.toLowerCase();
    const scores = {};

    // Score each decision-making agent based on keyword matches
    for (const [agentName, role] of Object.entries(AGENT_ROLES)) {
      if (role.type !== 'decision_maker') continue;

      let score = 0;
      let matchedKeywords = [];

      // Check speaksFirstFor keywords (high weight)
      for (const keyword of role.speaksFirstFor) {
        if (taskLower.includes(keyword.toLowerCase())) {
          score += 3;
          matchedKeywords.push(keyword);
        }
      }

      // Check broader domain keywords (lower weight)
      for (const domain of role.domains) {
        if (taskLower.includes(domain.toLowerCase())) {
          score += 1;
          matchedKeywords.push(domain);
        }
      }

      if (score > 0) {
        scores[agentName] = {
          score,
          matchedKeywords: [...new Set(matchedKeywords)] // dedupe
        };
      }
    }

    // Find the highest scoring agent
    let primaryAgent = null;
    let maxScore = 0;
    let reasoning = '';

    for (const [agentName, data] of Object.entries(scores)) {
      if (data.score > maxScore) {
        maxScore = data.score;
        primaryAgent = agentName;
        reasoning = `Matched keywords: ${data.matchedKeywords.join(', ')}`;
      }
    }

    // Calculate confidence
    const totalScore = Object.values(scores).reduce((sum, data) => sum + data.score, 0);
    const confidence = totalScore > 0 ? (maxScore / totalScore) : 0;

    // Determine task type based on primary agent
    let taskType = 'general';
    if (primaryAgent) {
      const role = AGENT_ROLES[primaryAgent];
      // Use the first matched keyword as task type
      if (scores[primaryAgent].matchedKeywords.length > 0) {
        taskType = scores[primaryAgent].matchedKeywords[0];
      }
    }

    // If no clear match, default to Growth_Strategist for strategic tasks
    if (!primaryAgent || confidence < 0.3) {
      primaryAgent = 'Growth_Strategist';
      taskType = 'strategic';
      confidence = 0.5;
      reasoning = 'No specific domain match, defaulting to strategic approach';
    }

    return {
      primaryAgent,
      taskType,
      confidence,
      reasoning,
      allScores: scores
    };
  }

  /**
   * Get secondary agents (all decision makers except primary)
   * @param {string} primaryAgent - The primary agent name
   * @returns {Array<string>} - List of secondary agent names
   */
  static getSecondaryAgents(primaryAgent) {
    return Object.entries(AGENT_ROLES)
      .filter(([name, role]) =>
        role.type === 'decision_maker' && name !== primaryAgent
      )
      .map(([name, _]) => name);
  }

  /**
   * Get all decision-making agents
   * @returns {Array<string>}
   */
  static getDecisionMakers() {
    return Object.entries(AGENT_ROLES)
      .filter(([_, role]) => role.type === 'decision_maker')
      .map(([name, _]) => name);
  }

  /**
   * Get all validator agents
   * @returns {Array<string>}
   */
  static getValidators() {
    return Object.entries(AGENT_ROLES)
      .filter(([_, role]) => role.type === 'validator')
      .map(([name, _]) => name);
  }
}

module.exports = TaskClassifier;
