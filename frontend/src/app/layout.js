import './globals.css';

export const metadata = {
  title: 'GitHub AI Agent Platform - Code Knowledge Graph & Test Generation',
  description: 'Multi-agent platform for GitHub code scanning, AST Knowledge Graph indexing, OWASP vulnerability auditing, and automated test synthesis.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
