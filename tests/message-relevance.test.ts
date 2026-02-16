import { describe, test, expect } from 'bun:test';
import { isRelevant } from '../src/core/message-relevance';

const baseRole = {
  id: 'swe', title: 'SWE', level: 'ic', reportsTo: 'eng-director',
  skills: [], model: { provider: 'anthropic' }, systemPrompt: '',
};
const directorRole = {
  ...baseRole, id: 'eng-director', title: 'Director', level: 'director', reportsTo: 'ceo',
  receives_from_direct_reports: true,
};
const ceoRole = {
  ...baseRole, id: 'ceo', title: 'CEO', level: 'executive', reportsTo: 'board',
  handles_sources: ['board'],
  handles_channels: ['company'],
  receives_from_direct_reports: true,
};

function makeMsg(overrides: Partial<{ from: string; channel: string; content: string }>) {
  return { id: '1', timestamp: 0, from: 'someone', channel: 'general', content: 'hello', status: 'pending' as const, ...overrides };
}

const noReports = () => [];

describe('isRelevant', () => {
  test('ignores own messages', () => {
    expect(isRelevant(makeMsg({ from: 'swe-1' }), 'swe-1', baseRole, noReports)).toBe(false);
  });

  test('board message goes to CEO only (via handles_sources)', () => {
    const msg = makeMsg({ from: 'board', channel: 'general' });
    expect(isRelevant(msg, 'ceo', ceoRole, noReports)).toBe(true);
    expect(isRelevant(msg, 'swe-1', baseRole, noReports)).toBe(false);
  });

  test('company channel goes to CEO only (via handles_channels + getExclusiveChannelRole)', () => {
    const msg = makeMsg({ from: 'eng-director', channel: 'company', content: 'all hands' });
    const exclusiveCompany = (ch: string) => (ch === 'company' ? 'ceo' : undefined);
    expect(isRelevant(msg, 'ceo', ceoRole, noReports, exclusiveCompany)).toBe(true);
    expect(isRelevant(msg, 'swe-1', baseRole, noReports, exclusiveCompany)).toBe(false);
  });

  test('company channel blocked even when sender is the agent manager', () => {
    const msg = makeMsg({ from: 'eng-director', channel: 'company', content: 'all hands' });
    const exclusiveCompany = (ch: string) => (ch === 'company' ? 'ceo' : undefined);
    expect(isRelevant(msg, 'swe-1', baseRole, noReports, exclusiveCompany)).toBe(false);
  });

  test('direct mention triggers response', () => {
    const msg = makeMsg({ content: 'hey swe-1 can you help' });
    expect(isRelevant(msg, 'swe-1', baseRole, noReports)).toBe(true);
  });

  test('manager message triggers response for direct report', () => {
    const msg = makeMsg({ from: 'eng-director', channel: 'engineering' });
    expect(isRelevant(msg, 'swe-1', baseRole, noReports)).toBe(true);
  });

  test('director responds to message from direct report', () => {
    const msg = makeMsg({ from: 'swe-1', channel: 'engineering' });
    const getReports = () => [{ id: 'swe-1' }];
    expect(isRelevant(msg, 'eng-director', directorRole, getReports)).toBe(true);
  });

  test('IC does not respond to unrelated message', () => {
    const msg = makeMsg({ from: 'other-agent', channel: 'general', content: 'random talk' });
    expect(isRelevant(msg, 'swe-1', baseRole, noReports)).toBe(false);
  });

  test('receives_from_direct_reports=false blocks director from responding to reports', () => {
    const directorNoReports = { ...directorRole, receives_from_direct_reports: false };
    const msg = makeMsg({ from: 'swe-1', channel: 'engineering' });
    const getReports = () => [{ id: 'swe-1' }];
    expect(isRelevant(msg, 'eng-director', directorNoReports, getReports)).toBe(false);
  });

  test('custom handles_sources on non-CEO role', () => {
    const specialRole = { ...baseRole, id: 'support', level: 'ic', handles_sources: ['customer-portal'] };
    const msg = makeMsg({ from: 'customer-portal' });
    expect(isRelevant(msg, 'support-1', specialRole, noReports)).toBe(true);
    expect(isRelevant(msg, 'swe-1', baseRole, noReports)).toBe(false);
  });
});
