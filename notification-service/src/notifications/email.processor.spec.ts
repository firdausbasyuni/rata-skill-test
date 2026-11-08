
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bull';
import type { ConfigService } from '@nestjs/config';

const { createTransportMock, sendMailMock, loggerLogMock, loggerErrorMock } =
  vi.hoisted(() => ({
    createTransportMock: vi.fn(),
    sendMailMock: vi.fn(),
    loggerLogMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock('@nestjs/common', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@nestjs/common')>();

  return {
    ...actual,
    Logger: class {
      log = loggerLogMock;
      error = loggerErrorMock;
    },
  };
});

import { EmailProcessor } from './email.processor.js';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let configService: ConfigService;

  const configValues: Record<string, string | undefined> = {
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    SMTP_FROM: 'Healthcare Scheduling <no-reply@healthcare.local>',
  };

  const job = {
    data: {
      to: 'customer@example.com',
      subject: 'Schedule Confirmation',
      text: 'Your schedule has been confirmed.',
      html: '<p>Your schedule has been confirmed.</p>',
    },
  } as Job<{
    to: string;
    subject: string;
    text: string;
    html?: string;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.assign(configValues, {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      SMTP_FROM: 'Healthcare Scheduling <no-reply@healthcare.local>',
    });

    configService = {
      get: vi.fn((key: string, defaultValue?: string) => {
        return configValues[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    createTransportMock.mockReturnValue({
      sendMail: sendMailMock,
    });

    sendMailMock.mockResolvedValue({
      messageId: 'test-message-id',
    });

    processor = new EmailProcessor(configService);
  });

  it('should configure SMTP using environment variables', () => {
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('should use default SMTP configuration when values are missing', () => {
    const defaultConfigService = {
      get: vi.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    new EmailProcessor(defaultConfigService);

    expect(createTransportMock).toHaveBeenLastCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('should not configure authentication when SMTP username is missing', () => {
    configValues.SMTP_USER = undefined;
    configValues.SMTP_PASSWORD = 'smtp-password';

    new EmailProcessor(configService);

    expect(createTransportMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });

  it('should not configure authentication when SMTP password is missing', () => {
    configValues.SMTP_USER = 'smtp-user';
    configValues.SMTP_PASSWORD = undefined;

    new EmailProcessor(configService);

    expect(createTransportMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });

  it('should configure SMTP authentication when credentials exist', () => {
    configValues.SMTP_USER = 'smtp-user';
    configValues.SMTP_PASSWORD = 'smtp-password';

    new EmailProcessor(configService);

    expect(createTransportMock).toHaveBeenLastCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: {
        user: 'smtp-user',
        pass: 'smtp-password',
      },
    });
  });

  it('should send an email successfully', async () => {
    await processor.handleSendEmail(job);

    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'Healthcare Scheduling <no-reply@healthcare.local>',
      to: 'customer@example.com',
      subject: 'Schedule Confirmation',
      text: 'Your schedule has been confirmed.',
      html: '<p>Your schedule has been confirmed.</p>',
    });

    expect(loggerLogMock).toHaveBeenCalledWith(
      'Email sent to customer@example.com. Message ID: test-message-id',
    );
  });

  it('should send an email without optional HTML content', async () => {
    const jobWithoutHtml = {
      data: {
        to: 'customer@example.com',
        subject: 'Schedule Confirmation',
        text: 'Your schedule has been confirmed.',
      },
    } as Job<{
      to: string;
      subject: string;
      text: string;
      html?: string;
    }>;

    await processor.handleSendEmail(jobWithoutHtml);

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        html: undefined,
      }),
    );
  });

  it('should log and rethrow errors when email delivery fails', async () => {
    const error = new Error('SMTP connection failed');
    sendMailMock.mockRejectedValue(error);

    await expect(processor.handleSendEmail(job)).rejects.toThrow(
      'SMTP connection failed',
    );

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to send email to customer@example.com',
      error,
    );
  });
});
