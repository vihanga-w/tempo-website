import React from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem',
        fontFamily: '"Helvetica Neue", sans-serif',
        color: '#fff',
        lineHeight: 1.6,
        overflow: "auto"
    },
    section: {
        marginTop: '2rem'
    },
    sectionTitle: {
        marginBottom: '0.5rem',
        fontSize: '1.5rem',
        borderBottom: '1px solid #ddd',
        paddingBottom: '0.3rem'
    }
};

type SectionProps = {
    number?: string;
    title: string;
    children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ number, title, children }) => (
    <section style={styles.section}>
        <h2 style={styles.sectionTitle}>
            {number ? `${number}. ${title}` : title}
        </h2>
        {children}
    </section>
);

const PrivacyPolicy: React.FC = () => {
    return (
        <div style={styles.container}>
            <h1>Tempo. – Privacy Policy</h1>
            <p><strong>Effective Date:</strong> [Insert Date]</p>

            <p>
                This Privacy Policy explains how <strong>Tempo.</strong> (“we”, “our”, or “us”) collects, uses, discloses and protects your personal data when you use the Tempo. mobile application (“App”). We are committed to protecting your privacy and complying with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and any other relevant data protection laws applicable in the United Kingdom.
            </p>

            <p>You may see us being referred to under the name of “Tempo Music”.</p>

            <p>By using Tempo., you acknowledge and agree to the practices described in this Privacy Policy.</p>

            <hr />

            <Section number="1" title="About Tempo.">
                <p>
                    Tempo. is a UK-based social music platform that allows users to connect their Spotify accounts, share their real-time listening activity with friends, react to music, and receive AI-powered music recommendations. The app is built on Spotify’s API and integrates various social features to enhance the music discovery experience.
                </p>
            </Section>

            <Section number="2" title="Information We Collect">
                <h3>Personal Information</h3>
                <p>When you connect your Spotify account, we collect the following:</p>
                <ul>
                    <li><strong>Spotify User ID</strong> – a unique identifier for your Spotify account.</li>
                    <li><strong>Display Name</strong> – your public Spotify name, used within the app to identify you.</li>
                    <li><strong>Email Address</strong> – to communicate with you and manage your account.</li>
                </ul>
                <p>We do not access or store your Spotify password. Authentication is handled securely by Spotify's own systems.</p>

                <h3>Location and Technical Data</h3>
                <p>
                    We collect your <strong>IP address</strong> to estimate your approximate geographic location (e.g. city or region). This helps us understand general usage patterns and may be used in the future to tailor regional content or features.
                </p>
                <p>
                    We also collect technical data such as your device type, operating system, and app version to help us optimise performance and provide support.
                </p>

                <h3>Usage and Activity Data</h3>
                <p>To understand how users interact with Tempo., we collect:</p>
                <ul>
                    <li>Timestamps of when the app is opened</li>
                    <li>Actions taken within the app (e.g. navigation events, reactions, comments)</li>
                    <li>Listening behaviours inferred via the Spotify API</li>
                    <li>Interaction with friends’ listening activity</li>
                </ul>
                <p>
                    This data enables us to improve recommendations, detect bugs, enhance UX, and generate insights.
                </p>
            </Section>

            <Section number="3" title="How We Use Your Data">
                <ul>
                    <li><strong>To provide access to the app and maintain functionality</strong>, including account login and Spotify integration.</li>
                    <li><strong>To personalise your user experience</strong> based on your listening behaviour and reactions.</li>
                    <li><strong>To recommend new music</strong> using our AI algorithms that analyse your interactions.</li>
                    <li><strong>To support social features</strong>, allowing you to follow friends, share listening data, and engage with others.</li>
                    <li><strong>To improve and develop the app</strong> by analysing how users interact with features and content.</li>
                    <li><strong>To ensure safety and compliance</strong>, including monitoring of comments or behaviour that may breach our Terms of Use.</li>
                    <li><strong>To communicate with you</strong>, including important updates, support messages or legal notices.</li>
                </ul>
            </Section>

            <Section number="4" title="Data Sharing and Sale">
                <p>We do not currently sell personal data. However, in the future we may enter into partnerships where <strong>anonymised and/or aggregated data</strong> is shared or sold to third parties.</p>
                <p>This data may include:</p>
                <ul>
                    <li>General listening trends and behaviour patterns</li>
                    <li>Reactions and sentiment analytics</li>
                    <li>Engagement metrics with artists or playlists</li>
                </ul>
                <p>
                    We will never sell individual user identities, contact information, or real-time playback data without explicit user consent.
                </p>
                <p>
                    Should we introduce any data sharing model, we will update this Privacy Policy and notify you in advance via the app or email.
                </p>
            </Section>

            <Section number="5" title="Legal Basis for Processing">
                <ul>
                    <li><strong>Contractual necessity</strong> – to enable you to access and use the app via your Spotify login.</li>
                    <li><strong>Legitimate interests</strong> – to analyse app usage and improve services.</li>
                    <li><strong>Consent</strong> – where applicable, such as for marketing communications or optional public visibility features.</li>
                </ul>
                <p>
                    If we rely on your consent for any processing activity, you have the right to withdraw that consent at any time.
                </p>
            </Section>

            <Section number="6" title="Children’s Privacy">
                <p>
                    Tempo. is not intended for children under the age of 13. We do not knowingly collect personal data from users under this age. If we discover that a user under 13 has registered, we will take appropriate steps to delete their data and account.
                </p>
                <p>
                    Users aged 13–17 may use the app, but we recommend they do so with the knowledge and permission of a parent or guardian. Certain features may be limited for under-18 users to comply with child safety regulations.
                </p>
            </Section>

            <Section number="7" title="Data Retention">
                <p>
                    We only retain your personal data for as long as necessary to fulfil the purposes for which it was collected, including legal, accounting, or reporting requirements.
                </p>
                <p>
                    Once your account is deleted, your personal data is removed or anonymised in accordance with our retention policy, unless we are required by law to retain it longer.
                </p>
            </Section>

            <Section number="8" title="Your Rights Under UK GDPR">
                <p>Under the UK GDPR, you have the following rights regarding your personal data:</p>
                <ul>
                    <li><strong>Right to access</strong> – You can request a copy of the personal data we hold about you.</li>
                    <li><strong>Right to rectification</strong> – You can request corrections to any inaccurate or incomplete information.</li>
                    <li><strong>Right to erasure</strong> – You can ask us to delete your data under certain conditions (“right to be forgotten”).</li>
                    <li><strong>Right to object</strong> – You may object to our use of your data for certain purposes.</li>
                    <li><strong>Right to restrict processing</strong> – You may ask us to suspend processing of your data under certain conditions.</li>
                    <li><strong>Right to data portability</strong> – You can request a copy of your data in a commonly used, machine-readable format.</li>
                </ul>
                <p>To exercise any of these rights, please contact us at <a href="mailto:hello@tempo-music.co">hello@tempo-music.co</a>.</p>
            </Section>

            <Section number="9" title="Security Measures">
                <p>
                    We take the security of your personal data seriously. We use a combination of encryption, access control, secure authentication methods, and anonymisation strategies to protect your information. However, no system is entirely immune to risk, and we cannot guarantee absolute security.
                </p>
            </Section>

            <Section number="10" title="International Data Transfers">
                <p>
                    While Tempo. is based in the UK, some of our service providers may process data outside of the UK or EEA. In such cases, we ensure that appropriate safeguards are in place, such as Standard Contractual Clauses or other lawful transfer mechanisms approved under the UK GDPR.
                </p>
            </Section>

            <Section number="11" title="Changes to This Privacy Policy">
                <p>
                    We may update this Privacy Policy from time to time. If changes are significant, we will notify you via the app or by email before they take effect. The most current version will always be available within the app and on our website.
                </p>
                <p>
                    We encourage you to review this Privacy Policy regularly to stay informed of how we are protecting your data.
                </p>
            </Section>

            <Section number="12" title="Contact">
                <p>
                    If you have questions, concerns, or requests relating to your personal data or this Privacy Policy, you can contact us at:
                </p>
                <p><strong>Email:</strong> <a href="mailto:hello@tempo-music.co">hello@tempo-music.co</a></p>
                <p>We aim to respond to all requests within 30 days.</p>
            </Section>

            <p>
                Tempo. is a product developed for music lovers, and we take your privacy as seriously as we do your listening experience. Thank you for trusting us.
            </p>
        </div>
    );
};

export default PrivacyPolicy;
