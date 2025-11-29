/**
 * TaskClassifier - Determines which agent should take the lead on a task
 */

const { AGENT_ROLES } = require('./AgentRoles');

class TaskClassifier {
  /**
   * Classify a task and determine the primary agent
   * @param {string} task - The task description
   * @param {Array<string>} availableAgents - List of available agent names from config
   * @returns {Object} - { primaryAgent, taskType, confidence, reasoning }
   */
  static classify(task, availableAgents = []) {
    const taskLower = task.toLowerCase();
    const scores = {};

    // Check if we have role definitions for any of the available agents
    const hasRoleDefs = availableAgents.some(name => AGENT_ROLES[name]);

    if (hasRoleDefs) {
      // Score each decision-making agent based on keyword matches
      // Only score agents that are both in AGENT_ROLES AND availableAgents
      for (const agentName of availableAgents) {
        const role = AGENT_ROLES[agentName];
        if (!role || role.type !== 'decision_maker') continue;

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

    // If no clear match, default to first available agent
    if (!primaryAgent || confidence < 0.3) {
      if (availableAgents.length > 0) {
        primaryAgent = availableAgents[0];
        taskType = 'general';
        confidence = 0.5;
        reasoning = `No specific domain match, using first available agent: ${primaryAgent}`;
      } else {
        // This shouldn't happen, but handle gracefully
        throw new Error('No agents available for task classification');
      }
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
   * Get secondary agents (all agents except primary)
   * @param {string} primaryAgent - The primary agent name
   * @param {Array<string>} availableAgents - List of available agent names from config
   * @returns {Array<string>} - List of secondary agent names
   */
  static getSecondaryAgents(primaryAgent, availableAgents = []) {
    // If we have AGENT_ROLES defined for these agents, filter by decision_maker type
    const rolesExist = availableAgents.some(name => AGENT_ROLES[name]);

    if (rolesExist) {
      return Object.entries(AGENT_ROLES)
        .filter(([name, role]) =>
          availableAgents.includes(name) &&
          role.type === 'decision_maker' &&
          name !== primaryAgent
        )
        .map(([name, _]) => name);
    }

    // Otherwise, just return all agents except primary
    return availableAgents.filter(name => name !== primaryAgent);
  }

  /**
   * Get all decision-making agents
   * @param {Array<string>} availableAgents - List of available agent names from config
   * @returns {Array<string>}
   */
  static getDecisionMakers(availableAgents = []) {
    // If we have AGENT_ROLES defined for these agents, filter by decision_maker type
    const rolesExist = availableAgents.some(name => AGENT_ROLES[name]);

    if (rolesExist) {
      return Object.entries(AGENT_ROLES)
        .filter(([name, role]) =>
          availableAgents.includes(name) && role.type === 'decision_maker'
        )
        .map(([name, _]) => name);
    }

    // Otherwise, return all available agents
    return availableAgents;
  }

  /**
   * Get all validator agents
   * @param {Array<string>} availableAgents - List of available agent names from config
   * @returns {Array<string>}
   */
  static getValidators(availableAgents = []) {
    // If we have AGENT_ROLES defined for these agents, filter by validator type
    const validatorsExist = availableAgents.some(name =>
      AGENT_ROLES[name] && AGENT_ROLES[name].type === 'validator'
    );

    if (validatorsExist) {
      return Object.entries(AGENT_ROLES)
        .filter(([name, role]) =>
          availableAgents.includes(name) && role.type === 'validator'
        )
        .map(([name, _]) => name);
    }

    // If no validators defined, return empty array (validators are optional)
    return [];
  }
}

module.exports = TaskClassifier;
