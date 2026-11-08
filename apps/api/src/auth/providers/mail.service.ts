import {
  Injectable,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly configService: ConfigService;
  private transporter: Transporter | null = null;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.configService = configService;
  }

  isConfigured(): boolean {
    const host = this.configService.get<string>('appConfig.mail.host') ?? '';
    const username =
      this.configService.get<string>('appConfig.mail.username') ?? '';
    const password =
      this.configService.get<string>('appConfig.mail.password') ?? '';
    const from = this.configService.get<string>('appConfig.mail.from') ?? '';
    return Boolean(host && username && password && from);
  }

  private getTransporter(): Transporter {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email is not configured. Set MAIL_HOST, MAIL_PORT, SMTP_USERNAME, SMTP_PASSWORD, and MAIL_FROM.',
      );
    }
    if (!this.transporter) {
      const host = this.configService.get<string>('appConfig.mail.host')!;
      const port = this.configService.get<number>('appConfig.mail.port') ?? 587;
      const user = this.configService.get<string>('appConfig.mail.username')!;
      const pass = this.configService.get<string>('appConfig.mail.password')!;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
    return this.transporter;
  }

  async sendOtp(to: string, code: string, purpose: 'login' | 'enable') {
    const from = this.configService.get<string>('appConfig.mail.from')!;
    const subject =
      purpose === 'enable'
        ? 'Tele-Pendant: confirm email 2FA'
        : 'Tele-Pendant: sign-in code';
    const action =
      purpose === 'enable'
        ? 'turn on email two-factor authentication'
        : 'finish signing in';
    await this.getTransporter().sendMail({
      from,
      to,
      subject,
      text: `Your Tele-Pendant code is ${code}.\n\nUse it to ${action}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      html: `<p>Your Tele-Pendant code is <strong style="font-size:1.25rem;letter-spacing:0.12em">${code}</strong>.</p><p>Use it to ${action}. It expires in 10 minutes.</p><p>If you did not request this, ignore this email.</p>`,
    });
  }
}
