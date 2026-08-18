# UI Rules Reference

These rules apply to every new or changed Market Desk UI surface.

## Typography

- Use `Inter` as the only approved UI font.
- Reuse the existing font stack in `market/public/styles.css`:

  ```css
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  ```

- Do not introduce another font family, imported web font, or one-off font stack.
- Use font weight, size, spacing, and color to create hierarchy instead of adding fonts.
- Keep `button` and `input` controls on the inherited UI font.

## UI Naming

- Use Title Case for visible UI labels and headings: `My Holdings`, `Stock Details`.
- Do not use PascalCase for user-facing text; `MyHoldings` is an identifier, not a label.
- Use PascalCase for new UI names: components, UI modules, view functions, and UI-specific JavaScript identifiers.
- Examples: `DashboardView`, `StockDetails`, `RenderDashboard`, `SearchResults`.
- Do not use kebab-case, snake_case, or camelCase for new UI names.
- When changing an existing UI name, prefer converting it to PascalCase if doing so does not break a public selector, test contract, or external integration.

## Required Exceptions

Keep these standards unchanged when required by the platform or an existing contract:

- HTML attributes and built-in DOM properties, such as `aria-label`, `data-range`, and `className`.
- CSS syntax, where selectors and custom properties remain lowercase/kebab-case, such as `.search-results` and `--surface`.
- URLs, route fragments, API fields, and external-provider names.
- Existing selectors or IDs consumed by tests or JavaScript, unless they are migrated together.

When an exception is necessary, do not create additional naming variants; document the reason in the change or review.
