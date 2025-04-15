import React from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem',
        fontFamily: '"Helvetica Neue", sans-serif',
        color: '#fff',
        lineHeight: 1.6,
        overflowY: "scroll",
        height: "100vh",
    },
    section: {
        marginTop: '2rem'
    },
    sectionTitle: {
        marginBottom: '0.5rem',
        fontSize: '1.5rem',
        borderBottom: '1px solid #ddd',
        paddingBottom: '0.3rem',
        fontWeight: "bold",
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

const TermsAndConditions: React.FC = () => {
    return (
        <div style={styles.container}>
            <h1 style={{
                fontSize: "28px",
                fontWeight: "bold",
            }}>Tempo. Terms & Conditions</h1>
            <p><strong>Effective Date:</strong> Tuesday 15th April 2025</p>
            <p><strong>Last Updated:</strong> Tuesday 15th April 2025</p>

            <br />

            <p>
                Welcome to <strong>Tempo.</strong>, a social music application that enables users to share their real-time Spotify listening activity with friends, react to what others are playing, and receive personalised music recommendations. These Terms and Conditions (“Terms”) govern your use of the Tempo. app (“we”, “us”, or “our”) and all related services. By using the app, you accept and agree to these Terms in full. If you do not agree to them, you must not use the app.
            </p>

            <p>You may see us being referred to under the name of “Tempo Music”.</p>

            {/* <hr /> */}

            <Section number="1" title="Eligibility">
                <p>
                    Tempo. is available to individuals aged thirteen (13) and over. If you are under the age of eighteen (18), you must have your parent or guardian’s consent to use the app. By accessing or using Tempo., you confirm that you meet these age requirements. If we discover that a user is under thirteen (13), we will take steps to delete their account and associated data in compliance with applicable child privacy laws.
                </p>
            </Section>

            <Section number="2" title="Account Creation and Login">
                <p>
                    Access to the app requires login using a valid Spotify account. When you connect your Spotify account, we collect certain information directly from Spotify, including your Spotify user ID, your display name, and your email address. We do not access, collect or store your Spotify password. You remain fully responsible for maintaining the confidentiality and security of your Spotify account and any other credentials you use to access the app. You agree to notify us immediately of any unauthorised access or use of your account.
                </p>
            </Section>

            <Section number="3" title="User Interactions and Content">
                <p>
                    Tempo. enables users to comment on and react to the music their friends are listening to in real time. These features create a socially dynamic environment but also require responsible use. You are solely responsible for the content you post, including text, reactions, emojis, and any other data shared through the app’s interaction tools.
                </p>
                <p>
                    By using Tempo., you agree not to submit content that is unlawful, offensive, defamatory, threatening, misleading, or infringes upon the rights of others, including intellectual property rights. We reserve the right, but not the obligation, to monitor content posted by users and to remove or restrict access to content at our sole discretion, without prior notice.
                </p>
            </Section>

            <Section number="4" title="Data Collection and Privacy">
                <p>
                    We are committed to protecting your personal data. Our Privacy Policy describes how we collect, use, store and share data, and by using the app, you agree to that policy.
                </p>
                <p>
                    In short, we collect your Spotify user ID, display name, and email address via the Spotify login process. We also collect your IP address to approximate your location. Additionally, we track how and when you use the app – including when you open it, what screens you navigate, and how you interact with features and other users. This data allows us to improve the app’s performance, personalise recommendations, and analyse user trends. All data is processed in accordance with UK GDPR and related laws.
                </p>
            </Section>

            <Section number="5" title="Social Features and Visibility">
                <p>
                    All user accounts on Tempo. are private by default. This means that in order for two users to interact, they must mutually approve a follow request. No user can see another’s listening activity or profile unless this connection is made.
                </p>
                <p>
                    In the future, we may introduce limited public visibility features, such as showcasing top listeners of a specific artist, or sharing summarised listening recaps. These features will only display aggregated or anonymised information and will never include real-time listening data unless you provide your explicit consent.
                </p>
            </Section>

            <Section number="6" title="Ownership and Licensing of Content">
                <p>
                    All intellectual property in the Tempo. app — including its branding, codebase, user interface, and content generated by the company — belongs to us or our licensors. By posting comments, reactions, or any other content within the app, you retain ownership of your own contributions, but you grant us a non-exclusive, worldwide, royalty-free licence to use, display, and distribute your content within the app as necessary for functionality.
                </p>
                <p>
                    This licence allows us to maintain a consistent and seamless experience across users while respecting your rights.
                </p>
            </Section>

            <Section number="7" title="Monetisation and Future Features">
                <p>
                    Tempo. is currently a free service without paid subscriptions, in-app purchases, or advertisements. However, we reserve the right to introduce monetisation features in the future. These may include, but are not limited to, premium subscriptions, exclusive features, or partnerships involving anonymised user data.
                </p>
                <p>
                    If we implement such changes, we will update these Terms and notify users through the app. Continued use after any updates indicates your acceptance of those changes.
                </p>
            </Section>

            <Section number="8" title="Third-Party Services">
                <p>
                    Tempo. relies on Spotify’s API to function. Your use of Spotify via our app is subject to Spotify’s own terms and privacy policy, which we do not control. We are not liable for any issues arising from Spotify’s services, including outages, data discrepancies, or policy changes.
                </p>
            </Section>

            <Section number="9" title="Termination">
                <p>
                    We reserve the right to suspend or terminate your access to Tempo. if we believe you have violated these Terms, abused other users, or engaged in behaviour that threatens the app’s safety or functionality. Termination may be immediate and without prior notice.
                </p>
                <p>
                    You may delete your account at any time by contacting us directly at <a href="mailto:hello@tempo-music.co" color="royalblue">hello@tempo-music.co</a>. Upon account deletion, we will remove your personal data in accordance with our retention and deletion policies.
                </p>
            </Section>

            <Section number="10" title="Limitation of Liability">
                <p>
                    Tempo. is provided “as is” and “as available.” To the fullest extent permitted by law, we disclaim all warranties, express or implied. We do not guarantee that the app will always be available, error-free, or fit for a particular purpose.
                </p>
                <p>
                    We are not liable for any indirect, incidental, consequential or punitive damages arising from your use of the app, including data loss, loss of reputation, or business interruption.
                </p>
            </Section>

            <Section number="11" title="Governing Law">
                <p>
                    These Terms shall be governed by and construed in accordance with the laws of England and Wales. You agree that any disputes relating to these Terms will be subject to the exclusive jurisdiction of the courts of England and Wales.
                </p>
            </Section>

            <Section title="Contact">
                <p>
                    If you have any questions about these Terms, please contact us at <a href="mailto:hello@tempo-music.co" color="royalblue">hello@tempo-music.co</a>.
                </p>
            </Section>
        </div>
    );
};

export default TermsAndConditions;
