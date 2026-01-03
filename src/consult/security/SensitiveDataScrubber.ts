import chalk from 'chalk';

export interface ScrubPattern {
  pattern: RegExp;
  replacement: string;
  type: string;
}

export interface ScrubReport {
  sensitiveDataScrubbed: boolean;
  patternsMatched: number;
  typesDetected: string[];
  detailsByType: Record<string, number>;
}

export interface ScrubResult {
  content: string;
  report: ScrubReport;
}

export class SensitiveDataScrubber {
  private readonly patterns: ScrubPattern[];

  constructor(patterns?: ScrubPattern[]) {
    this.patterns = patterns ?? defaultPatterns;
  }

  scrub(content: string): ScrubResult {
    let scrubbedContent = content;
    const detailsByType: Record<string, number> = {};
    let totalMatches = 0;
    const seenMatches = new Set<string>();

    for (const { pattern, replacement, type } of this.patterns) {
      // Create a new regex to avoid lastIndex issues
      const regex = new RegExp(pattern.source, pattern.flags);
      
      scrubbedContent = scrubbedContent.replace(regex, (match, ...args) => {
        // If it's already a REDACTED placeholder, skip it.
        if (match.includes('[REDACTED')) {
          return match;
        }

        totalMatches++;
        detailsByType[type] = (detailsByType[type] || 0) + 1;

        // If replacement contains group references ($1, $2, etc.), we need to expand them
        if (replacement.includes('$')) {
          let expanded = replacement;
          // args contains captured groups, then offset, then original string
          // We only care about captures
          args.forEach((val, idx) => {
            if (typeof val === 'string') {
              expanded = expanded.replace(new RegExp(`\\$${idx + 1}`, 'g'), val);
            }
          });
          return expanded;
        }

        return replacement;
      });
    }

    const typesDetected = Object.keys(detailsByType);

    return {
      content: scrubbedContent,
      report: {
        sensitiveDataScrubbed: totalMatches > 0,
        patternsMatched: totalMatches,
        typesDetected,
        detailsByType
      }
    };
  }

  formatReport(report: ScrubReport): string {
    if (!report.sensitiveDataScrubbed) {
      return ''; // Silent success
    }

    const lines: string[] = [
      chalk.yellow(`🔒 Security: ${report.patternsMatched} sensitive values detected and masked in context:`)
    ];

    // Sort types alphabetically for consistent output
    const sortedTypes = Object.keys(report.detailsByType).sort();

    for (const type of sortedTypes) {
      const count = report.detailsByType[type];
      const displayType = type.replace(/_/g, ' ');
      lines.push(chalk.yellow(`  - ${count} ${displayType}${count > 1 ? 's' : ''}`));
    }

    return lines.join('\n');
  }
}

// Default patterns (comprehensive list)
const defaultPatterns: ScrubPattern[] = [
  // OpenAI specific
  {
    pattern: /sk-[a-zA-Z0-9]{48,}/g,
    replacement: '[REDACTED_OPENAI_KEY]',
    type: 'openai_key'
  },

  // Anthropic specific
  {
    pattern: /sk-ant-[a-zA-Z0-9-]+/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
    type: 'anthropic_key'
  },

  // GitHub
  {
    pattern: /ghp_[a-zA-Z0-9]{36,40}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
    type: 'github_token'
  },
  {
    pattern: /github_pat_[a-zA-Z0-9_]{22,}/g,
    replacement: '[REDACTED_GITHUB_PAT]',
    type: 'github_token'
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_GITHUB_OAUTH]',
    type: 'github_token'
  },
  {
    pattern: /ghu_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_GITHUB_USER]',
    type: 'github_token'
  },

  // Private Keys
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[^]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
    replacement: '[REDACTED_PRIVATE_KEY]',
    type: 'private_key'
  },
  {
    pattern: /-----BEGIN RSA PRIVATE KEY-----[^]*?-----END RSA PRIVATE KEY-----/gi,
    replacement: '[REDACTED_RSA_KEY]',
    type: 'private_key'
  },
  {
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[^]*?-----END OPENSSH PRIVATE KEY-----/gi,
    replacement: '[REDACTED_SSH_KEY]',
    type: 'ssh_key'
  },

  // AWS
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
    type: 'aws_key'
  },
  {
    pattern: /\baws_secret_access_key\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: 'aws_secret_access_key=[REDACTED_AWS_SECRET]',
    type: 'aws_secret'
  },

  // Database URLs (preserve structure, redact password)
  {
    pattern: /(postgresql|postgres|mysql|mongodb|mongodb\+srv|redis|amqp):\/\/([^:]+):([^@]+)@/gi,
    replacement: '$1://$2:[REDACTED]@',
    type: 'database_password'
  },

  // Slack
  {
    pattern: /xox[baprs]-[0-9A-Za-z-]+/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
    type: 'slack_token'
  },

  // Stripe
  {
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_SECRET]',
    type: 'stripe_key'
  },
  {
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_TEST_KEY]',
    type: 'stripe_key'
  },
  {
    pattern: /pk_live_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_PUBLISHABLE]',
    type: 'stripe_key'
  },

  // SendGrid
  {
    pattern: /SG\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g,
    replacement: '[REDACTED_SENDGRID_KEY]',
    type: 'sendgrid_key'
  },

  // Twilio
  {
    pattern: /SK[a-f0-9]{32}/g,
    replacement: '[REDACTED_TWILIO_KEY]',
    type: 'twilio_key'
  },

  // Google Cloud / Firebase
  {
    pattern: /AIza[0-9A-Za-z-_]{35}/g,
    replacement: '[REDACTED_GOOGLE_API_KEY]',
    type: 'google_key'
  },

  // npm tokens
  {
    pattern: /npm_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_NPM_TOKEN]',
    type: 'npm_token'
  },

  // --- GENERIC PATTERNS (Must be last to avoid overriding specific ones) ---

  // API Keys (various formats)
  {
    pattern: /\b[A-Z_]*API_KEY\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: '[REDACTED_API_KEY]',
    type: 'api_key'
  },

  // Secrets (generic)
  {
    pattern: /\b[A-Z_]*SECRET[_A-Z]*\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: '[REDACTED_SECRET]',
    type: 'secret'
  },

  // Passwords
  {
    pattern: /\bpassword\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: 'password=[REDACTED_PASSWORD]',
    type: 'password'
  },
  {
    pattern: /\bPASSWORD\s*[=:]\s*['"]?[^\s'"]+['"]?/g,
    replacement: 'PASSWORD=[REDACTED_PASSWORD]',
    type: 'password'
  },

  // Tokens (generic)
  {
    pattern: /\b[A-Z_]*TOKEN\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: '[REDACTED_TOKEN]',
    type: 'token'
  },
  {
    pattern: /\bbearer\s+[a-zA-Z0-9._-]+/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
    type: 'bearer_token'
  },

  // Connection strings
  {
    pattern: /\b[A-Z_]*CONNECTION_STRING\s*[=:]\s*['"]?[^\s'"]+['"]?/gi,
    replacement: '[REDACTED_CONNECTION_STRING]',
    type: 'connection_string'
  }
];
