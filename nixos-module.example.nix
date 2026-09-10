# Job Hunt CRM — NixOS module snippet
#
# Declarative wiring for your NixOS host. Add to /etc/nixos/configuration.nix
# (or your modules dir). Assumes Docker is enabled (virtualisation.docker.enable = true)
# and Caddy is managed by NixOS (services.caddy.enable = true).

{ config, pkgs, ... }:

{
  # 1) Run the compose stack as a systemd service wrapping `docker compose`.
  systemd.services.job-hunt-crm = {
    wantedBy = [ "multi-user.target" ];
    after = [ "docker.service" "caddy.service" ];
    path = [ pkgs.docker-compose ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      WorkingDirectory = "/srv/job-hunt-crm"; # copy the repo here (root = dir with docker-compose.yml)
      ExecStart = "${pkgs.docker-compose}/bin/docker compose up -d --remove-orphans";
      ExecStop = "${pkgs.docker-compose}/bin/docker compose down";
    };
  };

  # 2) Caddy routes. Append to services.caddy.extraConfig (or your Caddyfile):
  #    handle_path /job-hunt-crm/*   { reverse_proxy frontend:80 }
  #    handle_path /job-hunt-crm/api/* { reverse_proxy backend:3000 }
  #    (see Caddyfile.example for the full block)
}
