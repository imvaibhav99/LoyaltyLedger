import { sendMail } from '../utils/mailer.js';
import { welcomeEmail } from '../templates/welcomeEmail.js';
import { resetCodeEmail } from '../templates/resetCodeEmail.js';

class EmailService {

  static sendWelcome = async ({ email, name, businessName }) => {
    const { subject, html, text } = welcomeEmail({ name, businessName });
    return sendMail({ to: email, subject, html, text });
  };

  static sendResetCode = async ({ email, name, code }) => {
    const { subject, html, text } = resetCodeEmail({ name, code });
    return sendMail({ to: email, subject, html, text });
  };

}

export default EmailService;
