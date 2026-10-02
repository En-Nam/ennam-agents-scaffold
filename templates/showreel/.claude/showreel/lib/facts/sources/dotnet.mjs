// Source 3c: *.sln → app.name; *.csproj Sdk + PackageReference whitelist → stack.item.

/** Whitelist, in emission order: NuGet id pattern → display. */
export const NUGET_STACK = [
  [/^Microsoft\.AspNetCore\./, 'ASP.NET Core'],
  [/^Microsoft\.EntityFrameworkCore/, 'EF Core'],
  [/^Swashbuckle\./, 'Swagger'],
  [/^Serilog/, 'Serilog'],
  [/^MediatR$/, 'MediatR'],
  [/^AutoMapper/, 'AutoMapper'],
  [/^Dapper$/, 'Dapper'],
  [/^Npgsql/, 'Npgsql'],
  [/^xunit$/i, 'xUnit'],
  [/^NUnit$/, 'NUnit'],
];

export function collect(ctx) {
  const out = [];

  // The solution file's name is the product name (project names inside it are build units).
  const sln = ctx.files.find((f) => !f.includes('/') && f.toLowerCase().endsWith('.sln'));
  if (sln) {
    const name = sln.slice(0, -4);
    out.push({ kind: 'app.name', value: name, display: name,
      source: { file: sln, locator: 'filename', extractor: 'dotnet-sln', rule: '*.sln file name → app.name' } });
  }

  for (const file of ctx.files) {
    if (!file.toLowerCase().endsWith('.csproj')) continue;
    const text = ctx.read(file);
    const refs = [];
    const sdk = /<Project\s+Sdk="([^"]+)"/.exec(text);
    if (sdk && sdk[1] === 'Microsoft.NET.Sdk.Web') refs.push(['Microsoft.AspNetCore.App', 'Project@Sdk']);
    const re = /<PackageReference\s+Include="([^"]+)"/g;
    let m;
    while ((m = re.exec(text))) refs.push([m[1], `PackageReference@${m[1]}`]);
    for (const [pattern, display] of NUGET_STACK) {
      const hit = refs.find(([id]) => pattern.test(id));
      if (hit) {
        out.push({ kind: 'stack.item', value: display, display,
          source: { file, locator: hit[1], extractor: 'csproj', rule: '*.csproj Sdk / PackageReference whitelist → stack.item' } });
      }
    }
  }
  return out;
}
