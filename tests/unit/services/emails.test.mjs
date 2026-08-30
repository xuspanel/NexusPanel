import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const emailsService = require('../../../src/services/emails');

describe('Email Service - Domain Authentication & DNS Provisioning', () => {
  it('constructs a strict SPF TXT record', () => {
    const spf = emailsService.buildSpfRecord('example.com');
    expect(spf).toBe('v=spf1 mx a -all');
  });

  it('constructs a baseline DMARC TXT record', () => {
    const dmarc = emailsService.buildDmarcRecord('example.com');
    expect(dmarc).toContain('v=DMARC1;');
    expect(dmarc).toContain('p=quarantine;');
    expect(dmarc).toContain('adkim=r;');
    expect(dmarc).toContain('aspf=r;');
  });

  it('parses raw rspamadm dkim_keygen output correctly', () => {
    const sampleOutput = `
mail._domainkey IN TXT ( "v=DKIM1; k=rsa; "
        "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAterLZXICETbfUxzRJ9El4e/pc/bk8rz+WDJukcfNyHwm8eSD6vMiN40tKbCOtU8qZTqfEPNgs7beYGnzD/nUun/UIVxG+3KSFTTUb+H/d53sJJvJfw4Q6xyOyBnA0iY47Na3A3ZVnlQxhzUoM3IzzKXIEqoXPwBBEA6IXtP+4lv+kt/aITSnXHmaN7yWPgBiNpf7WvIHoVhWP/OnK"
        "zCbtsNHQNn4YHGxlfJ3znBhdpyM9jWg8O67kW9UtQYb0/Oy6QnuPY5aMKs/PoX7WP1C5LyxwqiVmQ59hW4VT0cXPR48jT+JvIDkcojhQGzc6Dnpc7rvnMkKuEUBhsxtC8tWwwIDAQAB"
) ;
`;
    const parsed = emailsService.parseDkimStdout(sampleOutput, 'mail');
    expect(parsed).toBeDefined();
    expect(parsed).toContain('v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA');
  });

  it('returns a comprehensive structured DNS records payload for a domain', async () => {
    const dnsData = await emailsService.getDomainDnsRecords('testdomain.com', 'mail');
    expect(dnsData.domain).toBe('testdomain.com');
    expect(dnsData.selector).toBe('mail');
    expect(Array.isArray(dnsData.records)).toBe(true);

    const dkimRecord = dnsData.records.find(r => r.host === 'mail._domainkey');
    expect(dkimRecord).toBeDefined();
    expect(dkimRecord.type).toBe('TXT');
    expect(dkimRecord.value).toContain('v=DKIM1;');

    const spfRecord = dnsData.records.find(r => r.fqdn === 'testdomain.com' && r.type === 'TXT');
    expect(spfRecord).toBeDefined();
    expect(spfRecord.value).toBe('v=spf1 mx a -all');

    const dmarcRecord = dnsData.records.find(r => r.host === '_dmarc');
    expect(dmarcRecord).toBeDefined();
    expect(dmarcRecord.value).toContain('v=DMARC1;');

    const mxRecord = dnsData.records.find(r => r.type === 'MX');
    expect(mxRecord).toBeDefined();
    expect(mxRecord.value).toBe('mail.testdomain.com');
    expect(mxRecord.priority).toBe(10);
  });

  it('rejects invalid domain names for security', async () => {
    await expect(emailsService.getDomainDnsRecords('invalid domain; rm -rf')).rejects.toThrow(/Invalid domain name/i);
    await expect(emailsService.generateDkimKey('test;inject.com')).rejects.toThrow(/Invalid domain name/i);
  });
});
