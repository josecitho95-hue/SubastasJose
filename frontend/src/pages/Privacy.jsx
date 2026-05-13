export default function Privacy() {
  return (
    <div className="section py-12 fade-up">
      <div className="max-w-2xl mx-auto card p-8 space-y-6">
        <h1 className="text-2xl font-bold text-stone-900">Aviso de Privacidad</h1>
        <p className="text-sm text-stone-400">Última actualización: 12 de mayo de 2026</p>

        <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
          <p>
            <strong>Subastas</strong>, con domicilio en la Ciudad de México, México, es responsable del tratamiento de los datos personales que nos proporciones. Este aviso se emite en cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">1. Datos Personales que Recopilamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombre completo y correo electrónico.</li>
            <li>Teléfono de contacto.</li>
            <li>Dirección de envío y facturación.</li>
            <li>Documentos de identidad (INE, pasaporte, comprobante de domicilio) para verificación KYC.</li>
            <li>Información de pago procesada por Stripe (no almacenamos datos de tarjeta).</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">2. Finalidades del Tratamiento</h2>
          <p><strong>Finalidades primarias:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Crear y administrar tu cuenta de usuario.</li>
            <li>Permitir tu participación en subastas.</li>
            <li>Procesar pagos y gestionar envíos.</li>
            <li>Cumplir con obligaciones regulatorias (LFPIORPI, prevención de lavado de dinero).</li>
          </ul>
          <p><strong>Finalidades secundarias:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Enviar notificaciones sobre subastas, promociones y actualizaciones.</li>
            <li>Realizar encuestas de satisfacción y mejorar nuestros servicios.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">3. Transferencia de Datos</h2>
          <p>
            Tus datos personales pueden ser transferidos a:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Stripe, Inc.</strong> para el procesamiento de pagos.</li>
            <li><strong>Autoridades competentes</strong> cuando exista un requerimiento legal.</li>
            <li><strong>Proveedores de logística</strong> para la entrega de productos.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">4. Derechos ARCO</h2>
          <p>
            Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos personales (Derechos ARCO). Para ejercer estos derechos, envía una solicitud a nuestro correo de privacidad incluyendo: nombre completo, descripción del derecho a ejercer, y copia de identificación oficial.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">5. Medidas de Seguridad</h2>
          <p>
            Implementamos medidas técnicas, administrativas y físicas para proteger tus datos personales contra daño, pérdida, alteración, destrucción o uso no autorizado. Sin embargo, ningún sistema es completamente seguro.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">6. Uso de Cookies y Tecnologías Similares</h2>
          <p>
            Utilizamos cookies para mantener tu sesión activa, recordar preferencias y analizar el uso de la plataforma. Puedes deshabilitar las cookies en tu navegador, aunque esto puede afectar la funcionalidad del sitio.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">7. Cambios al Aviso de Privacidad</h2>
          <p>
            Nos reservamos el derecho de actualizar este aviso en cualquier momento. Las modificaciones serán publicadas en esta página con la fecha de actualización correspondiente.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">8. Contacto</h2>
          <p>
            Para cualquier duda sobre este aviso o el tratamiento de tus datos, contacta a nuestro Oficial de Protección de Datos a través de los canales de soporte de la plataforma.
          </p>
        </div>
      </div>
    </div>
  )
}
