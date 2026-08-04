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
const OPERATOR_EMAIL = 'ostertag188@gmail.com'

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
          Rahmen einer gewerblichen Tätigkeit. Die im Footer verlinkte Unterstützungsmöglichkeit
          über Ko-fi dient ausschließlich der freiwilligen Deckung der Betriebskosten. Es werden
          dafür keinerlei Gegenleistungen angeboten — keine Mitgliedschaften, Vorteile,
          Zusatzfunktionen oder Waren.
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
          erfolgt bei DigitalOcean LLC; mit DigitalOcean besteht ein Auftragsverarbeitungsvertrag auf
          Basis von dessen{' '}
          <a
            className="text-blood-hi underline decoration-blood/40 underline-offset-2 hover:text-ink"
            href="https://www.digitalocean.com/legal/data-processing-agreement"
            target="_blank"
            rel="noreferrer"
          >
            Data Processing Agreement
          </a>
          .
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          3. Lokale Datenspeicherung im Browser
        </p>
        <p>
          Decks, Inventar, Formatlisten und Einstellungen werden ausschließlich lokal in Ihrem
          Browser gespeichert (Origin Private File System und localStorage). Diese Daten verlassen
          Ihr Gerät nicht und sind für uns nicht einsehbar — sofern Sie keine Synchronisierung
          über ein Konto aktivieren (siehe Ziffer 4). Sie können die lokalen Daten jederzeit selbst
          löschen, indem Sie die Website-Daten in Ihrem Browser entfernen. Es werden keine Cookies
          zu Tracking- oder Werbezwecken gesetzt; es kommen keine Analyse- oder Werbedienste zum
          Einsatz.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          4. Konto, Passkeys und Synchronisierung (optional)
        </p>
        <p>
          Ein Konto ist optional und ausschließlich dafür da, Decks und Inventar auf ein weiteres
          Gerät zu übertragen — ohne Konto funktioniert SchreckNet vollständig. Bei der
          Kontoerstellung speichern wir auf dem Server: einen von Ihnen gewählten Anzeigenamen, das
          Erstellungsdatum, die kryptografischen öffentlichen Schlüssel Ihrer Passkeys (WebAuthn,
          keine biometrischen Daten — diese verbleiben auf Ihrem Gerät) sowie einen gesalzenen
          Hashwert Ihres einmalig angezeigten Wiederherstellungscodes. Es werden keine E-Mail-Adresse
          und kein Passwort erhoben (Grundsatz der Datenminimierung, Art.&nbsp;5 Abs.&nbsp;1 lit.&nbsp;c
          DSGVO). Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO (Vertragserfüllung
          durch Nutzung des Kontos).
        </p>
        <p>
          Aktivieren Sie die Synchronisierung, wird eine vollständige Kopie Ihrer lokalen Decks und
          Ihres Inventars in Ihrem Browser mit einem aus Ihrem Wiederherstellungscode abgeleiteten
          Schlüssel verschlüsselt (AES-256-GCM) und erst danach auf den Server übertragen. Der
          Schlüssel selbst verlässt Ihr Gerät nie. Wir speichern ausschließlich den verschlüsselten
          Datenblock; ein Zugriff auf dessen Inhalt ist uns technisch nicht möglich. Für
          MCP/REST-Zugriff ohne Browser können Sie zusätzlich API-Tokens erstellen, die
          ausschließlich lesenden/schreibenden Zugriff auf diesen verschlüsselten Datenblock
          erlauben — keine Verwaltung von Passkeys, Tokens oder Kontolöschung.
        </p>
        <p>
          Sie können Ihr Konto und alle zugehörigen Daten (Passkeys, Sitzungen, API-Tokens,
          synchronisierter Datenblock) jederzeit selbst und endgültig über die Kontoseite löschen
          (Art.&nbsp;17 DSGVO). Ihre lokalen Decks und Ihr Inventar in diesem Browser sind davon
          nicht betroffen.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          5. Semantische Suche (lokales KI-Modell)
        </p>
        <p>
          Die optionale &bdquo;Semantisch&ldquo;-Suche findet Karten anhand von Begriffen statt
          exakter Textübereinstimmung. Dafür wird ein kleines, vortrainiertes Sprachmodell
          (all-MiniLM-L6-v2, quantisiert) verwendet, das nach Aktivierung dieser Funktion einmalig
          (ca. 46&nbsp;MB) heruntergeladen und anschließend vollständig lokal in Ihrem Browser
          ausgeführt wird (ONNX Runtime, WebAssembly). Ihre Suchanfragen und der Kartentext
          verlassen dabei zu keinem Zeitpunkt Ihr Gerät — es findet keine Übertragung an uns, an
          Dritte oder an einen externen KI-Dienst statt. Die Funktion ist rein optional und muss
          aktiv ausgewählt werden; ohne Aktivierung wird kein Modell geladen. Es findet keine
          automatisierte Entscheidungsfindung oder Profilbildung im Sinne von Art.&nbsp;22 DSGVO
          statt — das Modell rankt lediglich vorhandene Karten nach Ähnlichkeit zur Suchanfrage.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          6. Spielgruppen (&bdquo;Table&ldquo;-Funktion)
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
          7. Kartenbilder von Drittanbietern
        </p>
        <p>
          Kartenbilder werden direkt von KRCG (static.krcg.org) geladen. Beim Laden eines
          Kartenbildes wird Ihre IP-Adresse technisch bedingt an den dortigen Server übertragen
          (Art. 6 Abs. 1 lit. f DSGVO — Interesse an der Darstellung der Karten, ohne die Bilder
          selbst vorhalten zu dürfen). Weitere Informationen finden Sie in den
          Datenschutzhinweisen von KRCG.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">
          8. Unterstützung über Ko-fi
        </p>
        <p>
          Der Footer enthält einen Link zu einer Spendenseite bei Ko-fi (Ko-fi Labs Ltd.,
          Vereinigtes Königreich). Beim bloßen Aufruf dieser Website werden keine Daten an Ko-fi
          übertragen; es sind keine Inhalte von Ko-fi eingebunden. Erst wenn Sie den Link
          anklicken, verlassen Sie diese Website und es gilt die Datenschutzerklärung von Ko-fi.
          Zahlungsdaten werden ausschließlich dort verarbeitet; wir erhalten und speichern keine
          Zahlungsdaten. Spenden sind rein freiwillig und ohne Gegenleistung; es werden keine
          Mitgliedschaften oder kostenpflichtigen Funktionen angeboten.
        </p>

        <p className="text-xs uppercase tracking-wide text-ink-dim">9. Ihre Rechte</p>
        <p>
          Sie haben gegenüber dem Verantwortlichen das Recht auf Auskunft (Art. 15 DSGVO),
          Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage von
          Art. 6 Abs. 1 lit. f DSGVO (Art. 21). Zudem besteht ein Beschwerderecht bei einer
          Datenschutz-Aufsichtsbehörde, z.&nbsp;B. beim Landesbeauftragten für den Datenschutz und
          die Informationsfreiheit Baden-Württemberg.
        </p>

        <p className="text-xs text-ink-dim">Stand: August 2026</p>
      </LegalSection>
    </div>
  )
}
