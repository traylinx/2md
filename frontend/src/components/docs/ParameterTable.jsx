export default function ParameterTable({ params }) {
  return (
    <div class="param-table-wrap">
      <table class="param-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map(({ name, type, defaultVal, description, required }) => (
            <tr key={name}>
              <td>
                <code class="param-name">{name}</code>
                {required && <span class="param-required">required</span>}
              </td>
              <td><code class="param-type">{type}</code></td>
              <td><code class="param-default">{defaultVal}</code></td>
              <td class="param-desc">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
