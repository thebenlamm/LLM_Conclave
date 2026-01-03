import { SensitiveDataScrubber, ScrubReport } from '../SensitiveDataScrubber';

describe('SensitiveDataScrubber', () => {
  describe('API Key Detection', () => {
    it('detects OPENAI_API_KEY format', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('OPENAI_API_KEY=sk-abc123xyz');
      expect(result.content).toContain('[REDACTED_API_KEY]');
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
      expect(result.content).toContain('[REDACTED_AWS_ACCESS_KEY]');
      expect(result.report.typesDetected).toContain('aws_key');
    });

    it('detects aws_secret_access_key', () => {
      const scrubber = new SensitiveDataScrubber();
      const result = scrubber.scrub('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result.content).toContain('[REDACTED_AWS_SECRET]');
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
