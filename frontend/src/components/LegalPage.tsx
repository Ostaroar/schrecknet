// Impressum + Datenschutzerklärung (/legal, aliases /impressum, /imprint,
// /datenschutz). Deliberately NOT run through the i18n layer: this is binding
// German legal text (§ 5 DDG, DSGVO) for a Germany-based operator — machine- or
// hand-translated legal copy in four languages would create divergent versions
// of a document that must be exact. Only the footer link label is localized.
// Update the operator details here if they ever change; keep them in sync with
// the contact address in the Datenschutzerklärung section below.

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  )
}

const OPERATOR_NAME = 'Jannik Ostertag'
const OPERATOR_STREET = 'König-Heinrich-Str. 17'
const OPERATOR_CITY = '69412 Eberbach'
const OPERATOR_COUNTRY = 'Deutschland'
const OPERATOR_EMAIL = 'ostertag118@gmail.com'

export default function LegalPage() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">Impressum &amp; Datenschutz</span>
        <h1 className="font-display text-3xl text-ink">Rechtliche Angaben</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          Legal notice and privacy policy for SchreckNet, provided in German as required for a
          Germany-based operator.
        </p>
      </div>

      <LegalSection title="Impressum">
        <p className="text-xs uppercase tracking-wide text-ink-dim">Angaben gemäß § 5 DDG</p>
        <p>
          {OPERATOR_NAME}
          <br />
          {OPERATOR_STREET}
          <br />
          {OPERATOR_CITY}
          <br />
          {OPERATOR_COUNTRY}
        </p>
        <p>
          E-Mail:{' '}
          <a className="text-blood-hi underline decoration-blood/40 underline-offset-2 hover:text-ink" href={`mailto:${OPERATOR_EMAIL}`}>
            {OPERATOR_EMAIL}
          </a>
        </p>
        <p>
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: {OPERATOR_NAME}, Anschrift wie oben.
        </p>
        <p>
          SchreckNet ist ein privat betriebenes, nicht-kommerzielles Hobbyprojekt einer
          Privatperson. Es besteht keine Gewinnerzielungsabsicht; der Betrieb erfolgt nicht im
          Rahmen einer gewerblichen Tätigkeit.
        </p>
      </LegalSection>

      <LegalSection title="Haftung für Links und Inhalte">
        <p>
          Diese Website enthält Links zu externen Websites Dritter (z.&nbsp;B. GitHub, KRCG,
          worldofdarkness.com, Ko-fi), auf deren Inhalte wir keinen Einfluss haben. Für diese
          fremden Inhalte ist stets der jeweilige Anbieter verantwortlich. Zum Zeitpunkt der
          Verlinkung waren keine rechtswidrigen Inhalte erkennbar; bei Bekanntwerden von
          Rechtsverletzungen werden entsprechende Links umgehend entfernt.
        </p>
        <p>
          Kartennamen, Kartentexte und Kartenbilder sind Eigentum von Paradox Interactive AB und
          werden im Rahmen der Dark-Pack-Richtlinie mit Genehmigung verwendet. SchreckNet ist
          inoffizieller Fan-Inhalt und weder von Paradox Interactive unterstützt noch mit Paradox
          Interactive verbunden.
        </p>
      </LegalSection>

      <LegalSection title="Datenschutzerklärung">
        <p className="text-xs uppercase tracking-wide text-ink-dim">1. Verantwortlicher</p>
        <p>
          Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO): {OPERATOR_NAME},{' '}
          {OPERATOR_STREET}, {OPERATOR_CITY}, {OPERATOR_COUNTRY}, E-Mail: {OPERATOR_EMAIL}.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">2. Hosting und Server-Logdaten</p>
        <p>
          Beim Aufruf dieser Website verarbeitet der Webserver automatisch technisch notwendige
          Daten (insbesondere IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Ressource,
          übertragene Datenmenge, Browserkennung). Diese Verarbeitung ist für den Betrieb und die
          Sicherheit der Website erforderlich (Art. 6 Abs. 1 lit. f DSGVO). Die Daten werden nicht
          mit anderen Datenquellen zusammengeführt und nach kurzer Zeit gelöscht. Das Hosting
          erfolgt bei einem externen Infrastruktur-Anbieter; mit diesem besteht, soweit
          erforderlich, ein Auftragsverarbeitungsvertrag.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          3. Lokale Datenspeicherung im Browser
        </p>
        <p>
          Decks, Inventar, Formatlisten und Einstellungen werden ausschließlich lokal in Ihrem
          Browser gespeichert (Origin Private File System und localStorage). Diese Daten verlassen
          Ihr Gerät nicht und sind für uns nicht einsehbar. Sie können sie jederzeit selbst
          löschen, indem Sie die Website-Daten in Ihrem Browser entfernen. Es werden keine Cookies
          zu Tracking- oder Werbezwecken gesetzt; es kommen keine Analyse- oder Werbedienste zum
          Einsatz.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          4. Spielgruppen (&bdquo;Table&ldquo;-Funktion)
        </p>
        <p>
          Legen Sie eine Spielgruppe an oder tragen Sie Spielergebnisse ein, werden die von Ihnen
          freiwillig eingegebenen Angaben (Gruppenname, Spielernamen, Deck-Namen, Ergebnisse,
          Datum) auf dem Server gespeichert, damit alle Personen mit dem Gruppencode darauf
          zugreifen können (Art. 6 Abs. 1 lit. b und f DSGVO). Geben Sie dabei nach Möglichkeit
          nur Vornamen oder Spitznamen ein. Die Daten sind nur über den zufälligen Gruppencode
          erreichbar und werden nicht öffentlich gelistet. Zur Löschung einer Gruppe oder
          einzelner Einträge genügt eine formlose E-Mail an die oben genannte Adresse.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          5. Kartenbilder von Drittanbietern
        </p>
        <p>
          Kartenbilder werden direkt von KRCG (static.krcg.org) geladen. Beim Laden eines
          Kartenbildes wird Ihre IP-Adresse technisch bedingt an den dortigen Server übertragen
          (Art. 6 Abs. 1 lit. f DSGVO — Interesse an der Darstellung der Karten, ohne die Bilder
          selbst vorhalten zu dürfen). Weitere Informationen finden Sie in den
          Datenschutzhinweisen von KRCG.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">6. Ihre Rechte</p>
        <p>
          Sie haben gegenüber dem Verantwortlichen das Recht auf Auskunft (Art. 15 DSGVO),
          Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage von
          Art. 6 Abs. 1 lit. f DSGVO (Art. 21). Zudem besteht ein Beschwerderecht bei einer
          Datenschutz-Aufsichtsbehörde, z.&nbsp;B. beim Landesbeauftragten für den Datenschutz und
          die Informationsfreiheit Baden-Württemberg.
        </p>

        <p className="text-xs text-ink-dim">Stand: Juli 2026</p>
      </LegalSection>
    </div>
  )
}
