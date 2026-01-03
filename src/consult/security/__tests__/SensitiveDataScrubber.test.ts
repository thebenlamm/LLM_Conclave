import { SensitiveDataScrubber } from '../SensitiveDataScrubber';

describe('SensitiveDataScrubber', () => {
  describe('API Key Detection', () => {
    it('detects OPENAI_API_KEY format', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('OPENAI_API_KEY=sk-abc123xyz');
      expect(result.content).toContain('OPENAI_API_KEY=[REDACTED_API_KEY]');
      expect(result.report.typesDetected).toContain('api_key');
    });

    it('detects API_KEY with quotes', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('API_KEY="mySecretKey123"');
      expect(result.content).toContain('[REDACTED_API_KEY]');
    });

    it('detects OpenAI sk- prefix keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('key = sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012345678');
      expect(result.report.typesDetected).toContain('openai_key');
      expect(result.content).toContain('[REDACTED_OPENAI_KEY]');
    });

    it('detects Anthropic sk-ant- keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('key = sk-ant-abcdefghijklmnopqrstuvwxyz-1234');
      expect(result.report.typesDetected).toContain('anthropic_key');
      expect(result.content).toContain('[REDACTED_ANTHROPIC_KEY]');
    });
  });

  describe('GitHub Token Detection', () => {
    it('detects ghp_ tokens', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd123456');
      expect(result.content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(result.report.typesDetected).toContain('github_token');
    });

    it('detects github_pat_ tokens', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('GITHUB_TOKEN=github_pat_ABCDEFGHIJKLMNOPQRSTUV');
      expect(result.content).toContain('[REDACTED_GITHUB_PAT]');
    });
  });

  describe('Private Key Detection', () => {
    it('detects PEM private keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEF...
-----END PRIVATE KEY-----`;
      const result = scrubber.scrub(content);
      expect(result.content).toBe('[REDACTED_PRIVATE_KEY]');
      expect(result.report.typesDetected).toContain('private_key');
    });

    it('detects RSA private keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
      const result = scrubber.scrub(content);
      expect(result.report.typesDetected).toContain('private_key');
    });
  });

  describe('Database URL Detection', () => {
    it('redacts password in PostgreSQL URLs', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('postgresql://admin:supersecret@localhost:5432/mydb');
      expect(result.content).toBe('postgresql://admin:[REDACTED]@localhost:5432/mydb');
      expect(result.report.typesDetected).toContain('database_password');
    });

    it('redacts password in MongoDB URLs', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('mongodb://user:pass123@cluster.mongodb.net/db');
      expect(result.content).toBe('mongodb://user:[REDACTED]@cluster.mongodb.net/db');
    });
  });

  describe('AWS Key Detection', () => {
    it('detects AKIA keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
      expect(result.content).toContain('[REDACTED_AWS_KEY]');
      expect(result.report.typesDetected).toContain('aws_key');
    });

    it('detects aws_secret_access_key', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result.content).toContain('aws_secret_access_key = [REDACTED_AWS_SECRET]');
      expect(result.report.typesDetected).toContain('aws_secret');
    });
  });

  describe('Generic Secret Detection', () => {
    it('detects SECRET_KEY assignments', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('SECRET_KEY="supersecret"');
      expect(result.content).toContain('SECRET_KEY="[REDACTED_SECRET]"');
      expect(result.report.typesDetected).toContain('secret');
    });
  });

  describe('Password Detection', () => {
    it('detects password key/value pairs', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('password: "hunter2"');
      expect(result.content).toContain('password: "[REDACTED_PASSWORD]"');
      expect(result.report.typesDetected).toContain('password');
    });
  });

  describe('Token Detection', () => {
    it('detects TOKEN assignments', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('TOKEN=abc123');
      expect(result.content).toContain('TOKEN=[REDACTED_TOKEN]');
      expect(result.report.typesDetected).toContain('token');
    });

    it('detects bearer tokens', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('bearer abc.def-123');
      expect(result.content).toContain('bearer [REDACTED_TOKEN]');
      expect(result.report.typesDetected).toContain('bearer_token');
    });
  });

  describe('Connection String Detection', () => {
    it('detects CONNECTION_STRING assignments', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('MY_CONNECTION_STRING="Server=localhost;Password=secret"');
      expect(result.content).toContain('MY_CONNECTION_STRING="[REDACTED_CONNECTION_STRING]"');
      expect(result.report.typesDetected).toContain('connection_string');
    });
  });

  describe('Third-party Token Detection', () => {
    it('detects Slack tokens', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('xoxb-1234-abcdef-5678');
      expect(result.content).toContain('[REDACTED_SLACK_TOKEN]');
      expect(result.report.typesDetected).toContain('slack_token');
    });

    it('detects Stripe keys', () => {
      const scrubber = new SensitiveDataScrubber();
      // Using sk_test_ prefix with fake pattern to avoid triggering secret scanners
      const result = scrubber.scrub('sk_test_00000000000000000000000000');
      expect(result.content).toContain('[REDACTED_STRIPE_TEST_KEY]');
      expect(result.report.typesDetected).toContain('stripe_key');
    });

    it('detects SendGrid keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('SG.abcdEFGH-1234.ijklMNOP-5678');
      expect(result.content).toContain('[REDACTED_SENDGRID_KEY]');
      expect(result.report.typesDetected).toContain('sendgrid_key');
    });

    it('detects Twilio keys', () => {
      const scrubber = new SensitiveDataScrubber();
      // Using obviously fake all-zeros pattern to avoid triggering secret scanners
      const result = scrubber.scrub('SK00000000000000000000000000000000');
      expect(result.content).toContain('[REDACTED_TWILIO_KEY]');
      expect(result.report.typesDetected).toContain('twilio_key');
    });

    it('detects Google API keys', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('AIzaSyD-abcdefghijABCDEFGHIJ123456789ab');
      expect(result.content).toContain('[REDACTED_GOOGLE_API_KEY]');
      expect(result.report.typesDetected).toContain('google_key');
    });

    it('detects npm tokens', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('npm_1234567890abcdefghijklmnopqrstuvwxyz');
      expect(result.content).toContain('[REDACTED_NPM_TOKEN]');
      expect(result.report.typesDetected).toContain('npm_token');
    });
  });

  describe('Multiple Matches', () => {
    it('counts all matches in report', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = `
        API_KEY=key1
        SECRET=secret1
        PASSWORD=pass1
        ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd123456
      `;
      const result = scrubber.scrub(content);
      expect(result.report.patternsMatched).toBe(4);
      expect(result.report.typesDetected.length).toBe(4);
    });

    it('groups by type correctly', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = `
        API_KEY=key1
        MY_API_KEY=key2
        ANOTHER_API_KEY=key3
      `;
      const result = scrubber.scrub(content);
      expect(result.report.detailsByType['api_key']).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty content', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('');
      expect(result.report.sensitiveDataScrubbed).toBe(false);
      expect(result.report.patternsMatched).toBe(0);
    });

    it('handles content with no secrets', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = 'const x = 1; function test() {}';
      const result = scrubber.scrub(content);
      expect(result.report.sensitiveDataScrubbed).toBe(false);
      expect(result.content).toBe(content);
    });

    it('handles JSON format', () => {
      const scrubber = new SensitiveDataScrubber();
      const content = '{"api_key": "sk-secret123", "database": "postgresql://user:pass@host/db"}';
      const result = scrubber.scrub(content);
      expect(result.report.patternsMatched).toBeGreaterThan(0);
    });
  });

  describe('formatReport', () => {
    it('returns empty string when no matches', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('no secrets here');
      const report = scrubber.formatReport(result.report);
      expect(report).toBe('');
    });

    it('formats report with counts', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('API_KEY=test ghp_ABCD1234567890ABCD1234567890ABCD12');
      const report = scrubber.formatReport(result.report);
      expect(report).toContain('Security:');
      expect(report).toContain('sensitive values detected');
    });
  });
});
