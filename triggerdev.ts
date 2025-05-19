import { TriggerClient, Trigger } from "@trigger.dev/sdk";

const client = new TriggerClient({
  id: "mi-aplicacion",
  apiKey: process.env.TRIGGER_API_KEY,
});

// Definir la cola
const QUEUE_NAME = "api-rate-limited-queue";
const RATE_LIMIT = 2; // Solicitudes por segundo
const DISTRIBUTION_WINDOW = 60000; // Ventana de distribución (1 minuto)

// Trabajador que procesa los elementos de la cola
client.defineJob({
  id: "api-queue-worker",
  name: "Trabajador de cola con rate limit",
  version: "1.0.0",
  
  // Configuración de concurrencia para asegurar que no se procesen demasiadas tareas simultáneamente
  concurrencyLimit: RATE_LIMIT,
  
  trigger: Trigger.queue({
    queueName: QUEUE_NAME,
  }),
  
  run: async (payload, io) => {
    try {
      // Registro para depuración
      await io.logger.info("Procesando solicitud API", { 
        payload_id: payload.id, 
        processing_time: new Date().toISOString() 
      });
      
      // Llamar a la API externa
      const response = await io.runTask("llamar-api", async () => {
        const result = await fetch("https://api-externa.com/endpoint", {
          method: "POST",
          body: JSON.stringify(payload.data),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${payload.apiKey}`
          }
        });
        
        if (!result.ok) {
          throw new Error(`Error API: ${result.status} ${await result.text()}`);
        }
        
        return await result.json();
      });
      
      // Reportar éxito
      await io.logger.info("Solicitud API exitosa", { 
        payload_id: payload.id, 
        response_status: "success" 
      });
      
      return { 
        success: true, 
        result: response, 
        processed_at: new Date().toISOString() 
      };
    } catch (error) {
      // Manejar errores
      await io.logger.error("Error en solicitud API", { 
        payload_id: payload.id, 
        error: error.message 
      });
      
      // Dependiendo de la política de reintentos, podrías querer relanzar el error
      throw error;
    }
  },
});

// Endpoint para recibir solicitudes y programarlas en la cola
client.defineJob({
  id: "api-request-scheduler",
  name: "Programador de solicitudes API",
  version: "1.0.0",
  
  trigger: Trigger.webhook({
    name: "api-request",
    source: "api.requests",
  }),
  
  run: async (payload, io) => {
    // 1. Obtener la información del estado actual de la cola
    const queueStateKey = "api_queue_state";
    const queueState = await io.store.get(queueStateKey) || {
      lastScheduledTime: Date.now(),
      pendingRequests: 0
    };
    
    // 2. Calcular el retraso óptimo para mantener la distribución uniforme
    const now = Date.now();
    let delay = 0;
    
    // Si ya tenemos solicitudes pendientes, calcular el retraso basado en cuántas hay
    if (queueState.pendingRequests > 0) {
      // Distribuir uniformemente las solicitudes en la ventana de tiempo
      // Calculamos (solicitudes pendientes / tasa) * 1000 para obtener milisegundos
      delay = (queueState.pendingRequests / RATE_LIMIT) * 1000;
      
      // Limitar el retraso máximo a nuestra ventana de distribución
      delay = Math.min(delay, DISTRIBUTION_WINDOW);
    } else {
      // Si no hay solicitudes pendientes, verificar cuánto tiempo ha pasado desde la última
      const timeSinceLastRequest = now - queueState.lastScheduledTime;
      
      // Si ha pasado menos de (1/tasa) segundos, agregar un pequeño retraso
      if (timeSinceLastRequest < (1000 / RATE_LIMIT)) {
        delay = (1000 / RATE_LIMIT) - timeSinceLastRequest;
      }
    }
    
    // 3. Actualizar el estado de la cola
    queueState.lastScheduledTime = now;
    queueState.pendingRequests += 1;
    await io.store.set(queueStateKey, queueState);
    
    // 4. Programar la tarea en la cola con el retraso calculado
    const scheduledTime = new Date(now + delay);
    
    // Preparar el payload con metadatos adicionales
    const queuePayload = {
      id: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      data: payload,
      apiKey: payload.apiKey || process.env.DEFAULT_API_KEY,
      scheduledAt: now,
      scheduledDelay: delay,
      expectedExecutionTime: scheduledTime.toISOString()
    };
    
    // Enviar a la cola con el retraso calculado
    await io.sendEvent({
      name: "queue.message",
      payload: queuePayload,
      queue: QUEUE_NAME,
      delay: delay
    });
    
    // 5. Configurar un callback para decrementar el contador cuando la tarea se complete
    // Nota: Esto es conceptual, la implementación exacta dependería de las capacidades de TriggerDev
    
    // 6. Devolver información sobre la programación
    return {
      message: "Solicitud programada exitosamente",
      request_id: queuePayload.id,
      queue: QUEUE_NAME,
      scheduled_at: now,
      delay_ms: delay,
      expected_execution_time: scheduledTime.toISOString(),
      pending_requests: queueState.pendingRequests
    };
  },
});