FROM node:22-alpine AS client
WORKDIR /client
RUN npm install --no-save @microsoft/signalr@10.0.11

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY OfficeFoosball.csproj ./
RUN dotnet restore
COPY . ./
RUN mkdir -p wwwroot/lib/signalr
COPY --from=client /client/node_modules/@microsoft/signalr/dist/browser/signalr.min.js ./wwwroot/lib/signalr/signalr.min.js
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "OfficeFoosball.dll"]
