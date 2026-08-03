# ADR 0008: Cleanup policy segura

## Status
Accepted

## Context
El cleanup periódico de docker es necesario para no llenar disco. Pero `docker image prune -af` borra TODAS las imágenes no usadas actualmente, lo que rompe la capacidad de rollback a versiones anteriores.

## Decision
**Política de prune segura**:
- ✅ `docker container prune -f` (contenedores parados).
- ✅ `docker image prune -f` (solo **dangling** images `<none>:<none>`).
- ✅ `docker builder prune -f` (build cache no usado).
- ❌ **NUNCA** `docker image prune -af` (rompe rollback).
- ❌ **NUNCA** `docker volume prune` (borra datos persistentes).

## Consequences
- (+) Imágenes tagged retenidas, rollback posible.
- (+) Datos persistentes seguros.
- (+) Operación segura para cron desatendido.
- (-) Mayor uso de disco a largo plazo (mitigado con `-af` manual puntual cuando hace falta).
- (-) Build cache puede crecer si hay mucho desarrollo activo.
