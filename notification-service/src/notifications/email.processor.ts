import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ConfigService } from '@nestjs/config';

interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: Number(this.configService.get<string>('SMTP_PORT', '1025')),
      secure: false,
      auth:
        this.configService.get<string>('SMTP_USER') &&
        this.configService.get<string>('SMTP_PASSWORD')
          ? {
              user: this.configService.get<string>('SMTP_USER'),
              pass: this.configService.get<string>('SMTP_PASSWORD'),
            }
          : undefined,
    });
  }

  @Process('send')
  async handleSendEmail(job: Job<EmailJob>): Promise<void> {
    const { to, subject, text, html } = job.data;

    try {
      const result = await this.transporter.sendMail({
        from: this.configService.get<string>(
          'SMTP_FROM',
          'Healthcare Scheduling <no-reply@healthcare.local>',
        ),
        to,
        subject,
        text,
        html,
      });

      this.logger.log(`Email sent to ${to}. Message ID: ${result.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}