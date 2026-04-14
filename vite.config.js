import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        assessment: resolve(__dirname, 'assessment.html'),
        chat: resolve(__dirname, 'chat.html'),
        faqs: resolve(__dirname, 'faqs.html'),
        howItWorks: resolve(__dirname, 'how-it-works.html'),
        login: resolve(__dirname, 'login.html'),
        onboarding: resolve(__dirname, 'onboarding.html'),
        profile: resolve(__dirname, 'profile.html'),
        signup: resolve(__dirname, 'signup.html'),
        therapistApply: resolve(__dirname, 'therapist-apply.html'),
        therapists: resolve(__dirname, 'therapists.html')
      }
    }
  }
});
