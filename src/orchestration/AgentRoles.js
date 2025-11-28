/**
 * AgentRoles - Defines agent types, responsibilities, and coordination rules
 */

const AGENT_TYPES = {
  DECISION_MAKER: 'decision_maker',
  VALIDATOR: 'validator'
};

/**
 * Agent role definitions with their domains and responsibilities
 */
const AGENT_ROLES = {
  Brand_Architect: {
    type: AGENT_TYPES.DECISION_MAKER,
    domains: [
      'naming',
      'messaging',
      'aesthetics',
      'brand identity',
      'storytelling',
      'product descriptions',
      'packaging language',
      'brand voice',
      'taglines',
      'visual identity'
    ],
    speaksFirstFor: [
      'naming',
      'messaging',
      'aesthetics',
      'brand',
      'story',
      'voice',
      'identity'
    ],
    critiquesAs: [
      'brand coherence',
      'aesthetic alignment',
      'message consistency'
    ]
  },

  Product_Mapper: {
    type: AGENT_TYPES.DECISION_MAKER,
    domains: [
      'SKU mapping',
      'kit assembly',
      'product structure',
      'operational constraints',
      'cost',
      'feasibility',
      'logistics',
      'pricing',
      'inventory',
      'supply chain'
    ],
    speaksFirstFor: [
      'SKU',
      'product mapping',
      'operations',
      'feasibility',
      'logistics',
      'pricing',
      'cost',
      'inventory'
    ],
    critiquesAs: [
      'operational feasibility',
      'cost implications',
      'logistics constraints'
    ]
  },

  Growth_Strategist: {
    type: AGENT_TYPES.DECISION_MAKER,
    domains: [
      'audience targeting',
      'launch plans',
      'community messaging',
      'influencer outreach',
      'distribution channels',
      'market positioning',
      'customer acquisition',
      'scaling strategy'
    ],
    speaksFirstFor: [
      'audience',
      'launch',
      'marketing',
      'growth',
      'distribution',
      'market',
      'strategy',
      'customer acquisition'
    ],
    critiquesAs: [
      'market viability',
      'audience resonance',
      'growth potential'
    ]
  },

  Compliance: {
    type: AGENT_TYPES.VALIDATOR,
    domains: [
      'legal requirements',
      'regulatory compliance',
      'risk assessment',
      'industry standards',
      'safety regulations',
      'claims validation'
    ],
    validatesFor: 'all',
    critiquesAs: [
      'legal compliance',
      'regulatory requirements',
      'risk factors'
    ]
  },

  Language_Filter: {
    type: AGENT_TYPES.VALIDATOR,
    domains: [
      'tone consistency',
      'brand voice alignment',
      'inclusivity',
      'clarity',
      'audience appropriateness',
      'messaging coherence'
    ],
    validatesFor: 'customer-facing content',
    critiquesAs: [
      'tone alignment',
      'language clarity',
      'brand voice consistency'
    ]
  },

  Experience_Designer: {
    type: AGENT_TYPES.VALIDATOR,
    domains: [
      'user experience',
      'customer journey',
      'touchpoints',
      'interaction design',
      'usability',
      'accessibility'
    ],
    validatesFor: 'product and customer interactions',
    critiquesAs: [
      'user experience',
      'customer journey',
      'accessibility'
    ]
  }
};

/**
 * Conflict resolution modes
 */
const RESOLUTION_MODES = {
  BRAND_FIRST: 'brand_first',
  OPERATIONS_FIRST: 'operations_first',
  MARKET_FIRST: 'market_first'
};

/**
 * Determine which resolution mode to use based on task type
 */
function getResolutionMode(taskType) {
  const brandFirst = ['naming', 'messaging', 'aesthetics', 'brand', 'voice', 'identity'];
  const operationsFirst = ['SKU', 'operations', 'feasibility', 'logistics', 'cost', 'pricing'];
  const marketFirst = ['audience', 'launch', 'marketing', 'growth', 'distribution', 'strategy'];

  const taskLower = taskType.toLowerCase();

  if (brandFirst.some(keyword => taskLower.includes(keyword))) {
    return RESOLUTION_MODES.BRAND_FIRST;
  }
  if (operationsFirst.some(keyword => taskLower.includes(keyword))) {
    return RESOLUTION_MODES.OPERATIONS_FIRST;
  }
  if (marketFirst.some(keyword => taskLower.includes(keyword))) {
    return RESOLUTION_MODES.MARKET_FIRST;
  }

  // Default to market-first for strategic decisions
  return RESOLUTION_MODES.MARKET_FIRST;
}

/**
 * Get decision-making agents (excludes validators)
 */
function getDecisionMakers() {
  return Object.entries(AGENT_ROLES)
    .filter(([_, role]) => role.type === AGENT_TYPES.DECISION_MAKER)
    .map(([name, _]) => name);
}

/**
 * Get validator agents
 */
function getValidators() {
  return Object.entries(AGENT_ROLES)
    .filter(([_, role]) => role.type === AGENT_TYPES.VALIDATOR)
    .map(([name, _]) => name);
}

/**
 * Determine if a task requires validation
 */
function requiresValidation(task) {
  const taskLower = task.toLowerCase();

  // Customer-facing content always needs validation
  const customerFacing = ['name', 'message', 'launch', 'marketing', 'product description', 'packaging'];
  if (customerFacing.some(keyword => taskLower.includes(keyword))) {
    return true;
  }

  // Major strategic decisions need validation
  const strategic = ['launch', 'strategy', 'plan', 'announce'];
  if (strategic.some(keyword => taskLower.includes(keyword))) {
    return true;
  }

  return false;
}

module.exports = {
  AGENT_TYPES,
  AGENT_ROLES,
  RESOLUTION_MODES,
  getResolutionMode,
  getDecisionMakers,
  getValidators,
  requiresValidation
};
