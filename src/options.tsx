import "@/i18n"
import { useI18n } from "@/i18n/helpers"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"

function IndexOptions() {
  const { _ } = useI18n()

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 16
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{_("app.name")}</h1>
        <LanguageSwitcher />
      </div>
      
      <section>
        <h2>{_("common.settings")}</h2>
        <p>{_("popup.welcome")}</p>
      </section>
      
      <footer style={{ marginTop: "auto", paddingTop: 32, color: "#666" }}>
        <p>🚧 {_("popup.stage.explorer")} - {_("popup.guide")}</p>
      </footer>
    </div>
  )
}

export default IndexOptions
